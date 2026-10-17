//! Picks book passages from a ranking so that no single chapter takes over.

use std::collections::HashMap;

/// The first `limit` ids of `ranked`, keeping at most `per_section` from the
/// same spine section.
pub fn spread(ranked: &[i64], section_of: &HashMap<i64, i64>, limit: usize, per_section: usize) -> Vec<i64> {
    let mut taken: HashMap<i64, usize> = HashMap::new();
    let mut out = Vec::with_capacity(limit);
    for id in ranked {
        let used = taken.entry(section_of.get(id).copied().unwrap_or(-1)).or_default();
        if *used < per_section {
            *used += 1;
            out.push(*id);
            if out.len() == limit {
                break;
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn caps_chunks_per_section_and_keeps_rank_order() {
        let sections: HashMap<i64, i64> = [(1, 0), (2, 0), (3, 0), (4, 1), (5, 2)].into_iter().collect();
        assert_eq!(spread(&[1, 2, 3, 4, 5], &sections, 4, 2), [1, 2, 4, 5]);
        assert_eq!(spread(&[1, 2, 3, 4, 5], &sections, 2, 2), [1, 2]);
    }
}
