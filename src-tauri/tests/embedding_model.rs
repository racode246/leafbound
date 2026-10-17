//! Exercises the real embedding model. Downloads ~135 MB on first run, so it
//! is ignored by default:
//!
//!     cargo test --test embedding_model -- --ignored --nocapture
//!
//! Files go to LEAFBOUND_MODEL_DIR, or the app's own model directory so the
//! app can reuse them.

use std::path::PathBuf;
use std::time::Instant;

use leafbound_lib::assistant::embed::Embedder;

fn model_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("LEAFBOUND_MODEL_DIR") {
        return PathBuf::from(dir);
    }
    let appdata = std::env::var("APPDATA").expect("APPDATA");
    PathBuf::from(appdata).join("dev.leafbound.app").join("models").join("multilingual-e5-small")
}

fn cosine_distance(a: &[f32], b: &[f32]) -> f32 {
    let dot: f32 = a.iter().zip(b).map(|(x, y)| x * y).sum();
    let na: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let nb: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    1.0 - dot / (na * nb)
}

#[test]
#[ignore]
fn downloads_loads_and_ranks_related_text_closer() {
    let embedder = Embedder::new(model_dir());
    let rt = tokio_runtime();
    rt.block_on(embedder.download(&reqwest::Client::new(), |done, total| {
        if done == total {
            println!("downloaded {total} bytes");
        }
    }))
    .unwrap();
    assert!(embedder.is_downloaded());

    let t = Instant::now();
    embedder.load().unwrap();
    println!("load: {:?}", t.elapsed());

    let passages: Vec<String> = [
        "吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。",
        "主人は胃弱で皮膚の色が淡黄色を帯びて弾力のない不活溌な徴候をあらわしている。",
        "The quarterly revenue grew by twelve percent due to strong cloud sales.",
        "汽車は長いトンネルを抜けると雪国であった。夜の底が白くなった。",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();
    let t = Instant::now();
    let vectors = embedder.embed_passages(&passages).unwrap();
    println!("embed {} passages: {:?}", passages.len(), t.elapsed());
    assert_eq!(vectors[0].len(), 384);

    let queries = ["猫の名前は何ですか？", "主人の健康状態は？", "How did revenue change?", "雪国の冒頭は？"];
    for (qi, q) in queries.iter().enumerate() {
        let qv = embedder.embed_query(q).unwrap();
        let distances: Vec<f32> = vectors.iter().map(|v| cosine_distance(&qv, v)).collect();
        println!("{q}: {distances:.3?}");
        let best = distances
            .iter()
            .enumerate()
            .min_by(|a, b| a.1.total_cmp(b.1))
            .map(|(i, _)| i)
            .unwrap();
        assert_eq!(best, qi, "query {q} should match passage {qi}");
    }

    // Same input, same vector (no batch effects from dynamic quantization).
    let again = embedder.embed_passages(&passages[..1]).unwrap();
    assert!(cosine_distance(&again[0], &vectors[0]) < 1e-5);

    let long: Vec<String> = (0..50).map(|i| format!("{} {i}", passages[i % 4].repeat(8))).collect();
    let t = Instant::now();
    embedder.embed_passages(&long).unwrap();
    println!("embed 50 long passages: {:?}", t.elapsed());
}

fn tokio_runtime() -> tokio::runtime::Runtime {
    tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap()
}
