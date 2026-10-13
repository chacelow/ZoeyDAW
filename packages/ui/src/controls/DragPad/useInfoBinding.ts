/**
 * useInfoBinding — hover / focus 时推 info 到 Footer Info Panel。
 */
import { useCallback, useEffect } from "react";
import {
  useControlEnvironment,
  type ControlInfo,
} from "../ControlEnvironment/useControlEnvironment";

export interface UseInfoBindingOptions {
  type: ControlInfo;
  description?: string;
  dragging?: boolean;
}

export interface UseInfoBindingResult {
  "aria-description"?: string;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
}

export function useInfoBinding({
  type,
  description,
  dragging = false,
}: UseInfoBindingOptions): UseInfoBindingResult {
  const { setInfo } = useControlEnvironment();

  const publish = useCallback(() => {
    setInfo?.(type);
  }, [setInfo, type]);

  const clear = useCallback(() => {
    if (!dragging) setInfo?.(null);
  }, [setInfo, dragging]);

  useEffect(() => {
    if (dragging) setInfo?.(type);
  }, [dragging, setInfo, type]);

  return {
    "aria-description": description,
    onPointerEnter: publish,
    onPointerLeave: clear,
    onFocus: publish,
    onBlur: clear,
  };
}
