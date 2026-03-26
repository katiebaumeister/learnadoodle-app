/**
 * Web-only spotlight + tooltip for parent explorer tour (planner → + NEW → right toolbar).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Modal } from 'react-native';

const PAD = 8;
/** Rounded spotlight cutout + ring (matches styles.ring borderRadius) */
const SPOTLIGHT_RADIUS = 12;

function roundedRectHolePath(x, y, w, h, r) {
  const rx = Math.max(0, Math.min(r, w / 2, h / 2));
  if (rx <= 0) {
    return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
  }
  return [
    `M ${x + rx} ${y}`,
    `H ${x + w - rx}`,
    `A ${rx} ${rx} 0 0 1 ${x + w} ${y + rx}`,
    `V ${y + h - rx}`,
    `A ${rx} ${rx} 0 0 1 ${x + w - rx} ${y + h}`,
    `H ${x + rx}`,
    `A ${rx} ${rx} 0 0 1 ${x} ${y + h - rx}`,
    `V ${y + rx}`,
    `A ${rx} ${rx} 0 0 1 ${x + rx} ${y}`,
    'Z',
  ].join(' ');
}

/** Full-viewport path with rounded-rect hole (evenodd → donut shape) */
function buildSpotlightPath(vw, vh, hole) {
  const outer = `M 0 0 L ${vw} 0 L ${vw} ${vh} L 0 ${vh} Z`;
  const inner = roundedRectHolePath(
    hole.left,
    hole.top,
    hole.width,
    hole.height,
    SPOTLIGHT_RADIUS
  );
  return `${outer} ${inner}`;
}

/** Single closed path: left tail + rounded rect (one continuous outline for Planner popover) */
function buildPlannerBubblePath(w, h, r = 14, tailW = 12) {
  const halfT = 9;
  const minMid = r + halfT + 1;
  const maxMid = h - r - halfT - 1;
  if (w < 40 || h < 40) {
    return `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`;
  }
  if (maxMid <= minMid) {
    const ym = h / 2;
    return [
      `M 0 ${ym}`,
      `L ${tailW} ${ym - halfT}`,
      `L ${tailW} ${r}`,
      `Q ${tailW} 0 ${tailW + r} 0`,
      `L ${w - r} 0`,
      `Q ${w} 0 ${w} ${r}`,
      `L ${w} ${h - r}`,
      `Q ${w} ${h} ${w - r} ${h}`,
      `L ${tailW + r} ${h}`,
      `Q ${tailW} ${h} ${tailW} ${h - r}`,
      `L ${tailW} ${ym + halfT}`,
      `L 0 ${ym}`,
      'Z',
    ].join(' ');
  }
  let yMid = Math.min(Math.max(24, h * 0.22), h - 24);
  yMid = Math.min(Math.max(yMid, minMid), maxMid);
  const yTop = yMid - halfT;
  const yBot = yMid + halfT;
  return [
    `M 0 ${yMid}`,
    `L ${tailW} ${yTop}`,
    `L ${tailW} ${r}`,
    `Q ${tailW} 0 ${tailW + r} 0`,
    `L ${w - r} 0`,
    `Q ${w} 0 ${w} ${r}`,
    `L ${w} ${h - r}`,
    `Q ${w} ${h} ${w - r} ${h}`,
    `L ${tailW + r} ${h}`,
    `Q ${tailW} ${h} ${tailW} ${h - r}`,
    `L ${tailW} ${yBot}`,
    `L 0 ${yMid}`,
    'Z',
  ].join(' ');
}

function getRectById(id) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return null;
  const el = document.getElementById(id);
  if (!el || typeof el.getBoundingClientRect !== 'function') return null;
  const r = el.getBoundingClientRect();
  return {
    top: r.top,
    left: r.left,
    width: r.width,
    height: r.height,
  };
}

export default function ExplorerTourOverlay({
  visible,
  title,
  body,
  targetId,
  primaryLabel = 'Next',
  showSkip = true,
  onNext,
  onSkip,
}) {
  const [rect, setRect] = useState(null);
  const [plannerBubbleLayout, setPlannerBubbleLayout] = useState(null);

  const measure = useCallback(() => {
    if (!visible || !targetId) {
      setRect(null);
      return;
    }
    const r = getRectById(targetId);
    setRect(r);
  }, [visible, targetId]);

  useEffect(() => {
    measure();
  }, [measure, targetId]);

  useEffect(() => {
    if (!visible || targetId !== 'explorer-tour-sidebar-planner') {
      setPlannerBubbleLayout(null);
    }
  }, [visible, targetId]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    const id = window.requestAnimationFrame(() => measure());
    const t = window.setTimeout(measure, 400);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
      window.cancelAnimationFrame(id);
      window.clearTimeout(t);
    };
  }, [measure, visible]);

  if (Platform.OS !== 'web' || !visible) return null;

  const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0;

  const hole = rect
    ? {
        top: Math.max(0, rect.top - PAD),
        left: Math.max(0, rect.left - PAD),
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      }
    : null;

  const tooltipBelowTop = hole ? hole.top + hole.height + 16 : 120;
  const placeTooltipAbove = hole && tooltipBelowTop + 220 > vh;

  /** Left-rail targets: float the popover to the right of the sidebar so it doesn’t cover nav */
  const isLeftRailPlanner =
    targetId === 'explorer-tour-sidebar-planner' && hole && vw > 0;

  /** Right toolbar: keep card left of the strip and below planner header (avoid gear row + icon rail) */
  const isRightToolbar =
    targetId === 'explorer-tour-right-toolbar' && hole && rect && vw > 0;

  const GAP = 16;
  const CARD_MAX_W = 340;
  /** Gap between tooltip right edge and toolbar left edge */
  const RIGHT_TOOLBAR_H_GAP = 14;
  /** Extra offset below target top (balance vs header row) */
  const RIGHT_TOOLBAR_TOP_EXTRA = 28;

  const cardPosition =
    !hole
      ? { position: 'fixed', left: 24, right: 24, bottom: 32, maxWidth: 400, alignSelf: 'center' }
      : isLeftRailPlanner && rect
        ? {
            position: 'fixed',
            left: Math.max(
              GAP,
              Math.min(hole.left + hole.width + GAP, vw - 368 - GAP)
            ),
            /* Top-align popover with Planner row (element top, not padded hole) */
            top: Math.max(16, Math.min(vh - 240, rect.top)),
            maxWidth: 368,
          }
        : isRightToolbar
          ? {
              position: 'fixed',
              /* Fully to the left of the spotlight (toolbar), not overlapping the rail */
              left: Math.max(
                GAP,
                Math.min(hole.left - CARD_MAX_W - RIGHT_TOOLBAR_H_GAP, vw - CARD_MAX_W - GAP)
              ),
              top: Math.max(
                64,
                Math.min(vh - 240, rect.top + RIGHT_TOOLBAR_TOP_EXTRA)
              ),
              maxWidth: CARD_MAX_W,
            }
          : placeTooltipAbove
            ? {
                position: 'fixed',
                left: Math.min(Math.max(16, hole.left - 48), vw - 360),
                top: Math.max(16, hole.top - 210),
                maxWidth: CARD_MAX_W,
              }
            : {
                position: 'fixed',
                left: Math.min(Math.max(16, hole.left - 48), vw - 360),
                top: Math.min(tooltipBelowTop, vh - 230),
                maxWidth: CARD_MAX_W,
              };

  const tourCardContent = (
    <>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardBody}>{body}</Text>
      <View style={styles.actions}>
        {showSkip ? (
          <TouchableOpacity onPress={onSkip} style={styles.skipBtn} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
            <Text style={styles.skipText}>Skip tour</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <TouchableOpacity onPress={onNext} style={styles.nextBtn} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
          <Text style={styles.nextText}>{primaryLabel}</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={[styles.root, { flex: 1 }]} pointerEvents="box-none">
        {hole ? (
          <>
            {/* Single SVG dim layer with rounded-rect hole (avoids sharp “glitch” corners from 4 rects) */}
            {Platform.OS === 'web' && vw > 0 && vh > 0 ? (
              <View
                pointerEvents="auto"
                style={styles.spotlightSvgWrap}
                dangerouslySetInnerHTML={{
                  __html: `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="none" style="display:block" pointer-events="none"><path fill="rgba(15, 23, 42, 0.52)" fill-rule="evenodd" pointer-events="fill" d="${buildSpotlightPath(
                    vw,
                    vh,
                    hole
                  )}" /></svg>`,
                }}
              />
            ) : null}
            {!isLeftRailPlanner ? (
              <View
                pointerEvents="none"
                style={[
                  styles.ring,
                  {
                    top: hole.top,
                    left: hole.left,
                    width: hole.width,
                    height: hole.height,
                    borderRadius: SPOTLIGHT_RADIUS,
                  },
                ]}
              />
            ) : null}
          </>
        ) : (
          <View style={[styles.shade, StyleSheet.absoluteFill]} pointerEvents="auto" />
        )}

        <View
          style={[cardPosition, isLeftRailPlanner && styles.cardRow, styles.tooltipShell]}
          pointerEvents="auto"
        >
          {isLeftRailPlanner ? (
            <View
              style={styles.plannerBubble}
              onLayout={(e) => {
                const { width, height } = e.nativeEvent.layout;
                if (width > 0 && height > 0) {
                  setPlannerBubbleLayout({ w: width, h: height });
                }
              }}
            >
              {Platform.OS === 'web' &&
              plannerBubbleLayout &&
              plannerBubbleLayout.w > 0 &&
              plannerBubbleLayout.h > 0 ? (
                <View
                  pointerEvents="none"
                  style={styles.plannerBubbleSvg}
                  dangerouslySetInnerHTML={{
                    __html: (() => {
                      const { w, h } = plannerBubbleLayout;
                      const d = buildPlannerBubblePath(w, h);
                      return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="display:block"><defs><filter id="explorerPlannerBubbleSh" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="rgb(15,23,42)" flood-opacity="0.18"/></filter></defs><path filter="url(#explorerPlannerBubbleSh)" d="${d}" fill="#f1f5f9" stroke="#64748b" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
                    })(),
                  }}
                />
              ) : null}
              <View
                style={[
                  styles.card,
                  styles.cardNarrow,
                  plannerBubbleLayout && styles.cardPlannerInner,
                ]}
              >
                {tourCardContent}
              </View>
            </View>
          ) : (
            <View style={styles.card}>{tourCardContent}</View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    ...(Platform.OS === 'web' && { position: 'fixed', inset: 0, zIndex: 100000 }),
  },
  shade: {
    position: 'fixed',
    backgroundColor: 'rgba(15, 23, 42, 0.52)',
    ...(Platform.OS === 'web' && { zIndex: 100000 }),
  },
  spotlightSvgWrap: {
    position: 'fixed',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    ...(Platform.OS === 'web' && { zIndex: 100000 }),
  },
  ring: {
    position: 'fixed',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.95)',
    ...(Platform.OS === 'web' && { zIndex: 100001 }),
  },
  /** Must sit above spotlight SVG (zIndex 100000) or dim layer captures all clicks */
  tooltipShell: {
    zIndex: 100003,
  },
  cardRow: {
    zIndex: 100002,
  },
  /** Wraps card + top-left caret for sidebar Planner step */
  plannerBubble: {
    position: 'relative',
    flex: 1,
    maxWidth: 340,
    minWidth: 260,
    overflow: 'visible',
  },
  plannerBubbleSvg: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },
  /** Content sits on top of unified SVG outline */
  cardPlannerInner: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    zIndex: 1,
    ...(Platform.OS === 'web' && {
      boxShadow: 'none',
    }),
  },
  card: {
    backgroundColor: '#f1f5f9',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#64748b',
    zIndex: 100002,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 16px 48px rgba(15, 23, 42, 0.22), 0 0 0 1px rgba(15, 23, 42, 0.1)',
    }),
  },
  cardNarrow: {
    flex: 1,
    maxWidth: 340,
    minWidth: 260,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
  cardBody: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 21,
    marginBottom: 16,
    ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", sans-serif' }),
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  skipBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  skipText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '600',
  },
  nextBtn: {
    backgroundColor: '#4f46e5',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
  },
  nextText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
