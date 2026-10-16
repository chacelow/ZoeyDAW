//! Persisted Arrangement policy overrides; numeric defaults belong to ARRANGEMENT_DEFAULTS.
use napi_derive::napi;
use serde::{Deserialize, Serialize};

#[napi(object)]
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ArrangementPreferences {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub zoom: Option<ArrangementZoomPreferences>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub follow: Option<ArrangementFollowPreferences>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_scroll: Option<ArrangementAutoScrollPreferences>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub automation: Option<ArrangementAutomationPreferences>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meter: Option<ArrangementMeterPreferences>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub keyboard: Option<ArrangementKeyboardPreferences>,
}

#[napi(object)]
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ArrangementZoomPreferences {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unmeasured_min_px_per_bar: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_zoom_timeline_ratio: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub step_in_factor: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub step_out_factor: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub step_anchor_ratio: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wheel_pixels_per_exponent: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub minimap_pixels_per_exponent: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub minimap_pan_scale: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub minimap_edge_hit_pixels: Option<f64>,
}

#[napi(object)]
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ArrangementFollowPreferences {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub manual_pan_pause_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trigger_ratio: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub anchor_ratio: Option<f64>,
}

#[napi(object)]
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ArrangementAutoScrollPreferences {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_elapsed_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub horizontal_pixels_per_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vertical_pixels_per_ms: Option<f64>,
}

#[napi(object)]
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ArrangementAutomationPreferences {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub freehand_sample_pixels: Option<f64>,
}

#[napi(object)]
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ArrangementMeterPreferences {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_db: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_db: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hold_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fall_db_per_second: Option<f64>,
}

#[napi(object)]
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ArrangementKeyboardPreferences {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub marker_nudge_bars: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub velocity_step: Option<u32>,
}

fn validate_number(
    name: &str,
    value: Option<f64>,
    in_range: impl FnOnce(f64) -> bool,
) -> Result<(), String> {
    if let Some(value) = value {
        if !value.is_finite() || !in_range(value) {
            return Err(format!("arrangement.{name} is outside its finite range"));
        }
    }
    Ok(())
}

impl ArrangementPreferences {
    pub(super) fn validate(&self) -> Result<(), String> {
        if let Some(zoom) = &self.zoom {
            for (name, value) in [
                ("zoom.unmeasuredMinPxPerBar", zoom.unmeasured_min_px_per_bar),
                ("zoom.minZoomTimelineRatio", zoom.min_zoom_timeline_ratio),
                ("zoom.wheelPixelsPerExponent", zoom.wheel_pixels_per_exponent),
                ("zoom.minimapPixelsPerExponent", zoom.minimap_pixels_per_exponent),
                ("zoom.minimapEdgeHitPixels", zoom.minimap_edge_hit_pixels),
            ] {
                validate_number(name, value, |value| value > 0.0)?;
            }
            validate_number("zoom.stepInFactor", zoom.step_in_factor, |value| value > 1.0)?;
            validate_number("zoom.stepOutFactor", zoom.step_out_factor, |value| value > 0.0 && value < 1.0)?;
            validate_number("zoom.stepAnchorRatio", zoom.step_anchor_ratio, |value| (0.0..=1.0).contains(&value))?;
            validate_number("zoom.minimapPanScale", zoom.minimap_pan_scale, |value| value >= 0.0)?;
        }
        if let Some(follow) = &self.follow {
            validate_number("follow.manualPanPauseMs", follow.manual_pan_pause_ms, |value| value >= 0.0)?;
            for (name, value) in [
                ("follow.triggerRatio", follow.trigger_ratio),
                ("follow.anchorRatio", follow.anchor_ratio),
            ] {
                validate_number(name, value, |value| (0.0..=1.0).contains(&value))?;
            }
        }
        if let Some(scroll) = &self.auto_scroll {
            validate_number("autoScroll.maxElapsedMs", scroll.max_elapsed_ms, |value| value > 0.0)?;
            for (name, value) in [
                ("autoScroll.horizontalPixelsPerMs", scroll.horizontal_pixels_per_ms),
                ("autoScroll.verticalPixelsPerMs", scroll.vertical_pixels_per_ms),
            ] {
                validate_number(name, value, |value| value >= 0.0)?;
            }
        }
        if let Some(automation) = &self.automation {
            validate_number("automation.freehandSamplePixels", automation.freehand_sample_pixels, |value| value > 0.0)?;
        }
        if let Some(meter) = &self.meter {
            validate_number("meter.minDb", meter.min_db, |value| value < 0.0)?;
            validate_number("meter.maxDb", meter.max_db, |value| value >= 0.0)?;
            validate_number("meter.holdMs", meter.hold_ms, |value| value >= 0.0)?;
            validate_number("meter.fallDbPerSecond", meter.fall_db_per_second, |value| value > 0.0)?;
        }
        if let Some(keyboard) = &self.keyboard {
            validate_number("keyboard.markerNudgeBars", keyboard.marker_nudge_bars, |value| value > 0.0)?;
            if keyboard.velocity_step.is_some_and(|value| !(1..=127).contains(&value)) {
                return Err("arrangement.keyboard.velocityStep must be an integer in 1..127".into());
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sparse_overrides_preserve_absence_and_accept_range_boundaries() {
        let value = serde_json::json!({
            "zoom": {"stepInFactor": 2.0, "stepOutFactor": 0.5, "stepAnchorRatio": 0.0},
            "follow": {"manualPanPauseMs": 0.0, "anchorRatio": 1.0},
            "autoScroll": {"maxElapsedMs": 1.0, "horizontalPixelsPerMs": 0.0},
            "automation": {"freehandSamplePixels": 1.0},
            "meter": {"minDb": -1.0, "maxDb": 0.0, "holdMs": 0.0, "fallDbPerSecond": 1.0},
            "keyboard": {"markerNudgeBars": 0.5, "velocityStep": 127}
        });
        let overrides: ArrangementPreferences = serde_json::from_value(value.clone()).unwrap();
        assert_eq!(overrides.validate(), Ok(()));
        assert_eq!(serde_json::to_value(overrides).unwrap(), value);
        assert_eq!(ArrangementPreferences::default().validate(), Ok(()));
        assert_eq!(serde_json::to_value(ArrangementPreferences::default()).unwrap(), serde_json::json!({}));
    }

    #[test]
    fn rejects_bad_values_for_every_override_field() {
        for (group, key, invalid) in [
            ("zoom", "unmeasuredMinPxPerBar", serde_json::json!(0)),
            ("zoom", "minZoomTimelineRatio", serde_json::json!(0)),
            ("zoom", "stepInFactor", serde_json::json!(1)),
            ("zoom", "stepOutFactor", serde_json::json!(1)),
            ("zoom", "stepAnchorRatio", serde_json::json!(-1)),
            ("zoom", "wheelPixelsPerExponent", serde_json::json!(0)),
            ("zoom", "minimapPixelsPerExponent", serde_json::json!(0)),
            ("zoom", "minimapEdgeHitPixels", serde_json::json!(0)),
            ("zoom", "minimapEdgeHitPixels", serde_json::json!(-1)),
            ("zoom", "minimapPanScale", serde_json::json!(-1)),
            ("follow", "manualPanPauseMs", serde_json::json!(-1)),
            ("follow", "triggerRatio", serde_json::json!(2)),
            ("follow", "anchorRatio", serde_json::json!(-1)),
            ("autoScroll", "maxElapsedMs", serde_json::json!(0)),
            ("autoScroll", "horizontalPixelsPerMs", serde_json::json!(-1)),
            ("autoScroll", "verticalPixelsPerMs", serde_json::json!(-1)),
            ("automation", "freehandSamplePixels", serde_json::json!(0)),
            ("meter", "minDb", serde_json::json!(0)),
            ("meter", "maxDb", serde_json::json!(-1)),
            ("meter", "holdMs", serde_json::json!(-1)),
            ("meter", "fallDbPerSecond", serde_json::json!(0)),
            ("keyboard", "markerNudgeBars", serde_json::json!(0)),
            ("keyboard", "velocityStep", serde_json::json!(128)),
            ("keyboard", "velocityStep", serde_json::json!(1.5)),
        ] {
            let mut fields = serde_json::Map::new();
            fields.insert(key.into(), invalid);
            let mut groups = serde_json::Map::new();
            groups.insert(group.into(), serde_json::Value::Object(fields));
            if let Ok(overrides) = serde_json::from_value::<ArrangementPreferences>(serde_json::Value::Object(groups)) {
                assert!(overrides.validate().is_err(), "{group}.{key}");
            }
        }
        for value in [serde_json::json!({"pointer": {}}), serde_json::json!({"zoom": {"unknown": 1}})] {
            assert!(serde_json::from_value::<ArrangementPreferences>(value).is_err());
        }
        let overrides = ArrangementPreferences {
            zoom: Some(ArrangementZoomPreferences { step_in_factor: Some(f64::INFINITY), ..Default::default() }),
            ..Default::default()
        };
        assert!(overrides.validate().is_err());
    }

    #[test]
    fn minimap_edge_hit_override_is_optional_finite_and_strictly_positive() {
        let value = serde_json::json!({"zoom": {"minimapEdgeHitPixels": 0.5}});
        let overrides: ArrangementPreferences = serde_json::from_value(value.clone()).unwrap();
        assert_eq!(overrides.validate(), Ok(()));
        assert_eq!(serde_json::to_value(overrides).unwrap(), value);
        for value in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            let overrides = ArrangementPreferences {
                zoom: Some(ArrangementZoomPreferences {
                    minimap_edge_hit_pixels: Some(value),
                    ..Default::default()
                }),
                ..Default::default()
            };
            assert!(overrides.validate().is_err());
        }
    }
}
