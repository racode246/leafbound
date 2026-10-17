//! Local text embeddings with multilingual-e5-small (int8 ONNX) via fastembed.
//!
//! The model files are fetched once from a pinned Hugging Face revision into
//! the app data directory and checked against SHA-256 digests before use.
//! e5 models expect "query: " / "passage: " prefixes on their input.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use fastembed::{
    InitOptionsUserDefined, Pooling, QuantizationMode, TextEmbedding, TokenizerFiles,
    UserDefinedEmbeddingModel,
};
use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use tokio::io::AsyncWriteExt;

/// Stored next to every vector so a future model change never mixes spaces.
pub const MODEL_ID: &str = "multilingual-e5-small-int8@761b726d";

const REPO: &str = "https://huggingface.co/Xenova/multilingual-e5-small/resolve/761b726dd34fb83930e26aab4e9ac3899aa1fa78";
const MAX_TOKENS: usize = 512;

struct ModelFile {
    remote: &'static str,
    local: &'static str,
    size: u64,
    sha256: &'static str,
}

const FILES: &[ModelFile] = &[
    ModelFile {
        remote: "onnx/model_quantized.onnx",
        local: "model_quantized.onnx",
        size: 118_308_185,
        sha256: "f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193",
    },
    ModelFile {
        remote: "tokenizer.json",
        local: "tokenizer.json",
        size: 17_082_730,
        sha256: "0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39",
    },
    ModelFile {
        remote: "config.json",
        local: "config.json",
        size: 658,
        sha256: "cb99455288675345e1a4f411438d5d0adbba5fbd3a67ea4fb03c015433b996c1",
    },
    ModelFile {
        remote: "tokenizer_config.json",
        local: "tokenizer_config.json",
        size: 443,
        sha256: "a1d6bc8734a6f635dc158508bef000f8e2e5a759c7d92f984b2c86e5ff53425b",
    },
    ModelFile {
        remote: "special_tokens_map.json",
        local: "special_tokens_map.json",
        size: 167,
        sha256: "d05497f1da52c5e09554c0cd874037a083e1dc1b9cfd48034d1c717f1afc07a7",
    },
];

pub fn total_download_size() -> u64 {
    FILES.iter().map(|f| f.size).sum()
}

pub struct Embedder {
    dir: PathBuf,
    model: Mutex<Option<TextEmbedding>>,
}

impl Embedder {
    pub fn new(dir: PathBuf) -> Self {
        Self {
            dir,
            model: Mutex::new(None),
        }
    }

    /// True when every model file has been downloaded and verified. Files are
    /// only moved into place after their digest matched, so presence is enough.
    pub fn is_downloaded(&self) -> bool {
        FILES.iter().all(|f| self.dir.join(f.local).is_file())
    }

    pub fn is_loaded(&self) -> bool {
        self.model.lock().map(|m| m.is_some()).unwrap_or(false)
    }

    /// Downloads missing files, reporting `(downloaded, total)` bytes.
    pub async fn download(
        &self,
        client: &reqwest::Client,
        mut progress: impl FnMut(u64, u64),
    ) -> Result<(), String> {
        tokio::fs::create_dir_all(&self.dir)
            .await
            .map_err(|e| format!("model dir: {e}"))?;
        let total = total_download_size();
        let mut done: u64 = FILES
            .iter()
            .filter(|f| self.dir.join(f.local).is_file())
            .map(|f| f.size)
            .sum();
        progress(done, total);
        for file in FILES {
            let target = self.dir.join(file.local);
            if target.is_file() {
                continue;
            }
            let base = done;
            fetch_verified(client, file, &target, |n| progress(base + n, total)).await?;
            done += file.size;
            progress(done, total);
        }
        Ok(())
    }

    /// Builds the ONNX session (blocking; call from a blocking thread).
    pub fn load(&self) -> Result<(), String> {
        let mut guard = self
            .model
            .lock()
            .map_err(|_| "embedder poisoned".to_string())?;
        if guard.is_some() {
            return Ok(());
        }
        let read = |name: &str| {
            std::fs::read(self.dir.join(name)).map_err(|e| format!("read {name}: {e}"))
        };
        let tokenizer_files = TokenizerFiles {
            tokenizer_file: read("tokenizer.json")?,
            config_file: read("config.json")?,
            special_tokens_map_file: read("special_tokens_map.json")?,
            tokenizer_config_file: read("tokenizer_config.json")?,
        };
        let model = UserDefinedEmbeddingModel::new(read("model_quantized.onnx")?, tokenizer_files)
            .with_pooling(Pooling::Mean)
            .with_quantization(QuantizationMode::Dynamic);
        let options = InitOptionsUserDefined::new().with_max_length(MAX_TOKENS);
        let embedding = TextEmbedding::try_new_from_user_defined(model, options)
            .map_err(|e| format!("embedding model failed to load: {e}"))?;
        *guard = Some(embedding);
        Ok(())
    }

    /// Embeds texts one at a time: the int8 model is dynamically quantized, so
    /// batching would make a vector depend on its batch neighbours.
    fn embed_prefixed(&self, prefix: &str, texts: &[String]) -> Result<Vec<Vec<f32>>, String> {
        let mut guard = self
            .model
            .lock()
            .map_err(|_| "embedder poisoned".to_string())?;
        let model = guard
            .as_mut()
            .ok_or_else(|| "embedding model is not loaded".to_string())?;
        let mut out = Vec::with_capacity(texts.len());
        for text in texts {
            let input = [format!("{prefix}{text}")];
            let mut v = model
                .embed(&input, None)
                .map_err(|e| format!("embedding failed: {e}"))?;
            out.push(
                v.pop()
                    .ok_or_else(|| "embedding returned nothing".to_string())?,
            );
        }
        Ok(out)
    }

    pub fn embed_passages(&self, texts: &[String]) -> Result<Vec<Vec<f32>>, String> {
        self.embed_prefixed("passage: ", texts)
    }

    pub fn embed_query(&self, text: &str) -> Result<Vec<f32>, String> {
        self.embed_prefixed("query: ", &[text.to_string()])?
            .pop()
            .ok_or_else(|| "embedding returned nothing".to_string())
    }
}

async fn fetch_verified(
    client: &reqwest::Client,
    file: &ModelFile,
    target: &Path,
    mut progress: impl FnMut(u64),
) -> Result<(), String> {
    let url = format!("{REPO}/{}", file.remote);
    let response = client
        .get(&url)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("download failed ({}): {e}", file.remote))?;
    let partial = target.with_extension("part");
    let mut out = tokio::fs::File::create(&partial)
        .await
        .map_err(|e| format!("write {}: {e}", partial.display()))?;
    let mut hasher = Sha256::new();
    let mut received: u64 = 0;
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("download interrupted ({}): {e}", file.remote))?;
        hasher.update(&chunk);
        out.write_all(&chunk)
            .await
            .map_err(|e| format!("write failed: {e}"))?;
        received += chunk.len() as u64;
        progress(received);
    }
    out.flush()
        .await
        .map_err(|e| format!("write failed: {e}"))?;
    drop(out);
    let digest = format!("{:x}", hasher.finalize());
    if digest != file.sha256 {
        let _ = tokio::fs::remove_file(&partial).await;
        return Err(format!("checksum mismatch for {}", file.remote));
    }
    tokio::fs::rename(&partial, target)
        .await
        .map_err(|e| format!("move {}: {e}", target.display()))
}
