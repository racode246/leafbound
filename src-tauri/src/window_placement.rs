//! Window position and size, kept from the last session.
//!
//! The window-state plugin saves the main window's position, size and maximized state on
//! exit and restores them when the window is created. It drops a saved position only when
//! no corner of the window is on any monitor, so a window saved on a monitor that is now
//! gone or rearranged can come back with its title bar off screen, or larger than the
//! screen it lands on. [`keep_on_screen`] moves such a window back.

use std::sync::Once;

use tauri::{PhysicalPosition, PhysicalSize, Runtime, Window};
use tauri_plugin_window_state::StateFlags;

/// What the plugin saves and restores. Not visibility (the E2E build hides the window)
/// or decorations (set per platform in the config).
pub const STATE_FLAGS: StateFlags = StateFlags::SIZE
    .union(StateFlags::POSITION)
    .union(StateFlags::MAXIMIZED);

/// Height of the strip at the top of the window that must be on screen to drag it (the
/// custom title bar on Windows, the overlay title bar on macOS), in logical pixels.
const GRAB_HEIGHT: f64 = 32.0;
/// How much of that strip's width must be on screen, in logical pixels.
const GRAB_MIN_WIDTH: f64 = 120.0;

/// A rectangle in physical pixels.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

impl Rect {
    fn right(&self) -> i64 {
        self.x as i64 + self.width as i64
    }

    fn bottom(&self) -> i64 {
        self.y as i64 + self.height as i64
    }

    /// Width and height of the overlap with `other`, zero when they do not overlap.
    fn overlap(&self, other: &Rect) -> (i64, i64) {
        let w = self.right().min(other.right()) - (self.x.max(other.x) as i64);
        let h = self.bottom().min(other.bottom()) - (self.y.max(other.y) as i64);
        (w.max(0), h.max(0))
    }
}

/// Where to put a window at `window` (outer bounds) so it can be reached on one of the
/// monitors' `work_areas`, primary first; `None` when it can stay. It can stay when its
/// grab strip (`grab_height` tall, at least `grab_min_width` of it) is on a monitor that
/// is large enough for the whole window. Otherwise it is shrunk to fit that monitor and
/// moved inside it, or, when no monitor has the strip, centred on the primary one.
pub fn fit(
    window: Rect,
    work_areas: &[Rect],
    grab_height: u32,
    grab_min_width: u32,
) -> Option<Rect> {
    let primary = work_areas.first()?;
    let grab = Rect {
        height: grab_height.min(window.height),
        ..window
    };
    let home = work_areas.iter().find(|area| {
        let (w, h) = grab.overlap(area);
        h == grab.height as i64 && w >= grab_min_width.min(grab.width) as i64
    });
    match home {
        Some(area) if window.width <= area.width && window.height <= area.height => None,
        Some(area) => {
            let width = window.width.min(area.width);
            let height = window.height.min(area.height);
            let x = window.x.clamp(area.x, (area.right() - width as i64) as i32);
            let y = window
                .y
                .clamp(area.y, (area.bottom() - height as i64) as i32);
            Some(Rect {
                x,
                y,
                width,
                height,
            })
        }
        None => {
            let width = window.width.min(primary.width);
            let height = window.height.min(primary.height);
            Some(Rect {
                x: primary.x + ((primary.width - width) / 2) as i32,
                y: primary.y + ((primary.height - height) / 2) as i32,
                width,
                height,
            })
        }
    }
}

/// Moves the main window back on screen if the restored position left it out of reach.
/// Called when its page has loaded, once per launch: the plugin restores the window when
/// the event loop creates it, after setup, and until then the window reports the
/// position from the config.
pub fn keep_on_screen_once<R: Runtime>(window: &Window<R>) {
    static CHECKED: Once = Once::new();
    CHECKED.call_once(|| {
        if let Err(e) = keep_on_screen(window) {
            log::warn!("Could not check the window position: {e}");
        }
    });
}

fn keep_on_screen<R: Runtime>(window: &Window<R>) -> tauri::Result<()> {
    if window.is_maximized()? || window.is_fullscreen()? {
        return Ok(());
    }
    let mut monitors = Vec::new();
    if let Some(primary) = window.primary_monitor()? {
        monitors.push(primary);
    }
    monitors.extend(window.available_monitors()?);
    let work_areas: Vec<Rect> = monitors
        .iter()
        .map(|m| {
            let area = m.work_area();
            Rect {
                x: area.position.x,
                y: area.position.y,
                width: area.size.width,
                height: area.size.height,
            }
        })
        .collect();

    let position = window.outer_position()?;
    let outer = window.outer_size()?;
    let inner = window.inner_size()?;
    let scale = window.scale_factor()?;
    let current = Rect {
        x: position.x,
        y: position.y,
        width: outer.width,
        height: outer.height,
    };
    let Some(target) = fit(
        current,
        &work_areas,
        (GRAB_HEIGHT * scale).round() as u32,
        (GRAB_MIN_WIDTH * scale).round() as u32,
    ) else {
        return Ok(());
    };
    log::info!("Window at {current:?} is off screen, moving it to {target:?}");
    // set_size takes the inner size; the frame around it keeps its size.
    let frame_w = outer.width.saturating_sub(inner.width);
    let frame_h = outer.height.saturating_sub(inner.height);
    window.set_size(PhysicalSize::new(
        target.width.saturating_sub(frame_w),
        target.height.saturating_sub(frame_h),
    ))?;
    window.set_position(PhysicalPosition::new(target.x, target.y))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const LAPTOP: Rect = Rect {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
    };
    // A larger monitor to the right of the laptop.
    const EXTERNAL: Rect = Rect {
        x: 1920,
        y: 0,
        width: 2560,
        height: 1440,
    };

    fn rect(x: i32, y: i32, width: u32, height: u32) -> Rect {
        Rect {
            x,
            y,
            width,
            height,
        }
    }

    fn fit_default(window: Rect, areas: &[Rect]) -> Option<Rect> {
        fit(window, areas, 32, 120)
    }

    #[test]
    fn a_window_on_screen_stays() {
        assert_eq!(fit_default(rect(100, 100, 1200, 800), &[LAPTOP]), None);
    }

    #[test]
    fn a_window_on_the_second_monitor_stays() {
        let window = rect(2200, 200, 1600, 1000);
        assert_eq!(fit_default(window, &[LAPTOP, EXTERNAL]), None);
    }

    #[test]
    fn a_window_hanging_off_the_bottom_or_side_stays_while_its_title_bar_is_reachable() {
        assert_eq!(fit_default(rect(1500, 600, 1200, 800), &[LAPTOP]), None);
    }

    #[test]
    fn a_window_on_a_monitor_that_is_gone_is_centred_on_the_primary_one() {
        let window = rect(2200, 200, 1200, 800);
        assert_eq!(
            fit_default(window, &[LAPTOP]),
            Some(rect(360, 140, 1200, 800))
        );
    }

    #[test]
    fn a_window_with_only_a_corner_left_on_screen_is_centred() {
        // The plugin keeps this one: its bottom-left corner is on the laptop.
        let window = rect(1900, -790, 1200, 800);
        assert_eq!(
            fit_default(window, &[LAPTOP]),
            Some(rect(360, 140, 1200, 800))
        );
    }

    #[test]
    fn a_window_whose_title_bar_is_above_the_screen_is_centred() {
        let window = rect(100, -20, 1200, 800);
        assert_eq!(
            fit_default(window, &[LAPTOP]),
            Some(rect(360, 140, 1200, 800))
        );
    }

    #[test]
    fn a_window_too_large_for_its_monitor_is_shrunk_and_moved_inside_it() {
        let window = rect(200, 100, 2400, 1300);
        assert_eq!(fit_default(window, &[LAPTOP]), Some(rect(0, 0, 1920, 1080)));
    }

    #[test]
    fn a_window_centred_on_a_smaller_primary_is_shrunk_to_it() {
        let window = rect(5000, 0, 2400, 1300);
        assert_eq!(
            fit_default(window, &[LAPTOP, EXTERNAL]),
            Some(rect(0, 0, 1920, 1080))
        );
    }

    #[test]
    fn the_work_area_offset_is_kept() {
        // A macOS menu bar or a Windows taskbar at the top.
        let area = rect(0, 25, 1440, 875);
        let window = rect(3000, 0, 1200, 800);
        assert_eq!(fit_default(window, &[area]), Some(rect(120, 62, 1200, 800)));
    }

    #[test]
    fn without_monitors_nothing_moves() {
        assert_eq!(fit_default(rect(-5000, -5000, 1200, 800), &[]), None);
    }
}
