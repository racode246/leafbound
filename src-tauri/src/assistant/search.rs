//! Picks book passages from a ranking so that no single chapter takes over.

use std::collections::HashMap;

/// The first `limit` ids of `ranked`, keeping at most `per_section` from the
/// same spine section. `uncapped` names a section the cap does not apply to
/// (the chapter being read, when the prompt holds only part of it).
pub fn spread(
    ranked: &[i64],
    section_of: &HashMap<i64, i64>,
    limit: usize,
    per_section: usize,
    uncapped: Option<i64>,
) -> Vec<i64> {
    let mut taken: HashMap<i64, usize> = HashMap::new();
    let mut out = Vec::with_capacity(limit);
    for id in ranked {
        let section = section_of.get(id).copied().unwrap_or(-1);
        let used = taken.entry(section).or_default();
        if *used < per_section || uncapped == Some(section) {
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
        let sections: HashMap<i64, i64> = [(1, 0), (2, 0), (3, 0), (4, 1), (5, 2)]
            .into_iter()
            .collect();
        assert_eq!(
            spread(&[1, 2, 3, 4, 5], &sections, 4, 2, None),
            [1, 2, 4, 5]
        );
        assert_eq!(spread(&[1, 2, 3, 4, 5], &sections, 2, 2, None), [1, 2]);
    }

    #[test]
    fn one_section_can_be_exempt_from_the_cap() {
        let sections: HashMap<i64, i64> = [(1, 0), (2, 0), (3, 0), (4, 1), (5, 1), (6, 1)]
            .into_iter()
            .collect();
        assert_eq!(
            spread(&[1, 2, 3, 4, 5, 6], &sections, 5, 2, Some(0)),
            [1, 2, 3, 4, 5]
        );
        assert_eq!(
            spread(&[4, 5, 6, 1, 2, 3], &sections, 5, 2, Some(0)),
            [4, 5, 1, 2, 3]
        );
    }
}
