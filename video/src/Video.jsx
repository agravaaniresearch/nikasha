// Nikasha and Vyaya: a self-explanatory explainer. No sound is needed: every
// point is written on screen in full sentences and held long enough to read.
// All figures come from src/data.json, exported from the real engine run on
// the synthetic samples. Palette matches the Nikasha page (no blue or navy).
import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import DATA from './data.json';

const C = {
  bg: '#efebe4', paper: '#f8f5f0', sunk: '#e6e0d6', ink: '#26211d', muted: '#6b6158', line: '#d6cdc0',
  accent: '#7d3427', accentSoft: '#ead8cf', ok: '#4f6b32', okSoft: '#dfe6cf', warn: '#93630f', warnSoft: '#f1e2bf',
  bad: '#9a2c22', badSoft: '#f1d6cf', nil: '#6d5f52'
};
const SERIF = 'Caladea, "DejaVu Serif", Georgia, serif';
const SANS = 'Inter, "DejaVu Sans", sans-serif';
const MONO = '"DejaVu Sans Mono", monospace';
const T = 20; // transition length in frames
const byId = Object.fromEntries(DATA.map((d) => [d.id, d]));
const VCOL = { READY: C.ok, CONDITIONAL: C.warn, NOT_READY: C.bad, SAVES: C.ok, EVIDENCE_DEPENDENT: C.warn, COSTS_MORE: C.bad };
const VSOFT = { READY: C.okSoft, CONDITIONAL: C.warnSoft, NOT_READY: C.badSoft, SAVES: C.okSoft, EVIDENCE_DEPENDENT: C.warnSoft, COSTS_MORE: C.badSoft };
const VTXT = { READY: 'Ready', CONDITIONAL: 'Conditional', NOT_READY: 'Not ready', SAVES: 'Saves money', EVIDENCE_DEPENDENT: 'Depends on evidence', COSTS_MORE: 'Costs more' };

// Smooth entrance: fade and rise, with a gentle spring.
function useIn(delay = 0) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - delay, fps, config: { damping: 200, mass: 0.8 } });
  return { opacity: s, transform: `translateY(${(1 - s) * 28}px)` };
}
const In = ({ d = 0, style, children }) => <div style={{ ...useIn(d), ...style }}>{children}</div>;

function Frame({ kicker, children, step }) {
  return (
    <AbsoluteFill style={{ background: C.bg, color: C.ink, fontFamily: SANS, padding: '96px 140px 120px' }}>
      {kicker && <In style={{ fontSize: 26, letterSpacing: 4, textTransform: 'uppercase', color: C.accent, fontWeight: 700, marginBottom: 26 }}>{kicker}</In>}
      {children}
      <div style={{ position: 'absolute', left: 140, right: 140, bottom: 48, display: 'flex', justifyContent: 'space-between', fontSize: 22, color: C.muted }}>
        <span>Working example on synthetic data. For illustration only.</span>
        <span style={{ fontFamily: MONO }}>{step}</span>
      </div>
    </AbsoluteFill>
  );
}
const H = ({ d = 0, size = 76, children, style }) => <In d={d} style={{ fontFamily: SERIF, fontSize: size, lineHeight: 1.12, fontWeight: 700, ...style }}>{children}</In>;
const P = ({ d = 0, size = 38, children, style }) => <In d={d} style={{ fontSize: size, lineHeight: 1.4, color: C.ink, ...style }}>{children}</In>;
const Pill = ({ v, big }) => (
  <span style={{ display: 'inline-block', padding: big ? '10px 26px' : '6px 18px', borderRadius: 999, background: VSOFT[v], color: VCOL[v], fontWeight: 700, fontSize: big ? 34 : 26 }}>{VTXT[v]}</span>
);

// 1. Title
function Title() {
  const f = useCurrentFrame();
  const w = interpolate(f, [10, 60], [0, 520], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  return (
    <Frame step="1 / 11">
      <div style={{ marginTop: 120 }}>
        <H size={150} style={{ color: C.accent }}>Nikasha <span style={{ color: C.muted, fontWeight: 400 }}>and</span> Vyaya</H>
        <div style={{ height: 6, width: w, background: C.accent, margin: '30px 0 44px' }} />
        <P d={20} size={50}>Is this clinical AI tool ready to enter practice?</P>
        <P d={34} size={50}>And can anyone afford to run it?</P>
        <P d={56} size={30} style={{ color: C.muted, marginTop: 50 }}>Two open-source tools from Agravaani Research, now connected by one shared contract.</P>
      </div>
    </Frame>
  );
}

// 2. The gap
function Gap() {
  const rows = [
    ['Regulation asks', 'whether the tool may legally be sold.'],
    ['Procurement asks', 'whether the hospital will buy it.'],
    ['Nobody owns the question', 'whether it should enter practice here, in this role, at this price.']
  ];
  return (
    <Frame kicker="The gap" step="2 / 11">
      <H>Three questions, and only two have an owner.</H>
      <div style={{ marginTop: 60, display: 'grid', gap: 30 }}>
        {rows.map((r, i) => (
          <In key={i} d={20 + i * 22} style={{ display: 'grid', gridTemplateColumns: '520px 1fr', gap: 30, padding: '28px 34px', background: i === 2 ? C.accentSoft : C.paper, borderLeft: `8px solid ${i === 2 ? C.accent : C.line}`, borderRadius: 8 }}>
            <span style={{ fontSize: 40, fontWeight: 700, color: i === 2 ? C.accent : C.ink }}>{r[0]}</span>
            <span style={{ fontSize: 40 }}>{r[1]}</span>
          </In>
        ))}
      </div>
    </Frame>
  );
}

// 3. The two projects and the contract
function Two() {
  const f = useCurrentFrame();
  const arrow = interpolate(f, [60, 100], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
  const card = (title, sub, items, d, col) => (
    <In d={d} style={{ background: C.paper, border: `2px solid ${C.line}`, borderTop: `10px solid ${col}`, borderRadius: 10, padding: '36px 40px' }}>
      <div style={{ fontFamily: SERIF, fontSize: 64, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 30, color: C.muted, margin: '6px 0 24px' }}>{sub}</div>
      {items.map((x, i) => <div key={i} style={{ fontSize: 32, padding: '8px 0', borderTop: `1px solid ${C.line}` }}>{x}</div>)}
    </In>
  );
  return (
    <Frame kicker="Two tools, one contract" step="3 / 11">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px 1fr', alignItems: 'center', marginTop: 20 }}>
        {card('Nikasha', 'Is the tool ready?', ['Entry: CT and MRI only', 'Tier 1: legal gates', 'Tier 2: clinical knockouts', 'Tier 3: evidence-weighted merit'], 10, C.accent)}
        <div style={{ textAlign: 'center' }}>
          <div style={{ height: 8, background: C.warn, width: `${arrow * 100}%`, margin: '0 auto', borderRadius: 4 }} />
          <div style={{ opacity: arrow, fontSize: 26, fontWeight: 700, color: C.warn, marginTop: 18, lineHeight: 1.3 }}>Cost profile contract</div>
        </div>
        {card('Vyaya', 'What does it cost?', ['State-wise landed power tariffs', 'Statutory hardware life', 'GPU failure rate and overhead', 'People, validation and errors'], 30, C.warn)}
      </div>
      <P d={110} size={34} style={{ marginTop: 50, color: C.muted }}>Nikasha reads six shared figures from a pinned copy of Vyaya, so each figure is held in one place only.</P>
    </Frame>
  );
}

// 4. Readiness pipeline with the three samples
function Readiness() {
  const steps = ['Entry', 'Legal gates', 'Clinical knockouts', 'Merit band'];
  return (
    <Frame kicker="Readiness" step="4 / 11">
      <H size={64}>The first tier a tool fails decides its verdict.</H>
      <div style={{ display: 'flex', gap: 18, margin: '44px 0 50px' }}>
        {steps.map((s, i) => (
          <In key={s} d={14 + i * 10} style={{ flex: 1, textAlign: 'center', padding: '22px 10px', background: C.paper, border: `2px solid ${C.line}`, borderRadius: 8, fontSize: 32, fontWeight: 700 }}>
            <span style={{ fontFamily: MONO, color: C.accent, marginRight: 12 }}>{i + 1}</span>{s}
          </In>
        ))}
      </div>
      <div style={{ display: 'grid', gap: 22 }}>
        {DATA.map((d, i) => (
          <In key={d.id} d={70 + i * 26} style={{ display: 'grid', gridTemplateColumns: '560px 260px 1fr', alignItems: 'center', gap: 26, padding: '20px 30px', background: C.paper, borderLeft: `10px solid ${VCOL[d.verdict]}`, borderRadius: 8 }}>
            <div><div style={{ fontSize: 34, fontWeight: 700 }}>{d.name}</div><div style={{ fontSize: 24, color: C.muted }}>{d.modality}, {d.mode} mode, fictional</div></div>
            <Pill v={d.verdict} />
            <div style={{ fontSize: 27, lineHeight: 1.35 }}>{d.id === 'pemberwick' ? 'Its sensitivity claim rests on a vendor brochure, so it fails the safety floor.' : d.id === 'orrisfield' ? `Its merit band of ${d.meritWorst} to ${d.meritBest} straddles the bar of ${d.bar}.` : `Its worst-case merit of ${d.meritWorst} clears the bar of ${d.bar}.`}</div>
          </In>
        ))}
      </div>
    </Frame>
  );
}

// 5. Cost layers for Halvorine
function Layers() {
  const f = useCurrentFrame();
  const d = byId.halvorine;
  const max = Math.max(...d.layers.map((l) => l.v));
  const total = d.layers.reduce((a, l) => a + l.v, 0);
  const people = d.layers.filter((l) => l.id === 'reading' || l.id === 'errors').reduce((a, l) => a + l.v, 0);
  return (
    <Frame kicker="Affordability" step="5 / 11">
      <H size={64}>Compute is the smallest line on the bill.</H>
      <P d={8} size={30} style={{ color: C.muted, marginTop: 10 }}>{d.name}: cost per study in rupees, worst performance case, eight layers.</P>
      <div style={{ marginTop: 34, display: 'grid', gap: 14 }}>
        {d.layers.map((l, i) => {
          const g = interpolate(f, [24 + i * 7, 60 + i * 7], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
          const compute = l.id === 'licence_compute' || l.id === 'power';
          return (
            <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '560px 1fr 170px', alignItems: 'center', gap: 24, opacity: Math.min(1, g * 2) }}>
              <span style={{ fontSize: 28 }}>{l.label}</span>
              <div style={{ height: 30, background: C.sunk, borderRadius: 4 }}>
                <div style={{ height: '100%', width: `${(l.v / max) * 100 * g}%`, background: compute ? C.warn : C.accent, borderRadius: 4 }} />
              </div>
              <span style={{ fontFamily: MONO, fontSize: 28, textAlign: 'right' }}>INR {Math.round(l.v * g)}</span>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 30, marginTop: 40 }}>
        <In d={110} style={{ flex: 1, padding: '22px 30px', background: C.warnSoft, borderRadius: 8, fontSize: 32 }}>Compute and power are <b>{d.computeShare}%</b> of the bill.</In>
        <In d={130} style={{ flex: 1, padding: '22px 30px', background: C.accentSoft, borderRadius: 8, fontSize: 32 }}>Reading time and errors are <b>{Math.round((people / total) * 100)}%</b> of it.</In>
      </div>
    </Frame>
  );
}

// 6. Two axes
function Axes() {
  return (
    <Frame kicker="Two separate axes" step="6 / 11">
      <H size={64}>A cheap tool cannot buy readiness.</H>
      <P d={10} size={32} style={{ color: C.muted, marginTop: 12 }}>Affordability never enters a gate, a knockout or the merit score. Each axis is reported on its own.</P>
      <div style={{ marginTop: 44, display: 'grid', gap: 22 }}>
        <In d={20} style={{ display: 'grid', gridTemplateColumns: '560px 1fr 1fr', fontSize: 26, color: C.muted, padding: '0 30px', letterSpacing: 2, textTransform: 'uppercase', fontWeight: 700 }}>
          <span>Fictional tool</span><span>Readiness</span><span>Affordability</span>
        </In>
        {DATA.map((d, i) => (
          <In key={d.id} d={36 + i * 22} style={{ display: 'grid', gridTemplateColumns: '560px 1fr 1fr', alignItems: 'center', padding: '22px 30px', background: C.paper, borderLeft: `10px solid ${d.id === 'pemberwick' ? C.bad : C.line}`, borderRadius: 8 }}>
            <span style={{ fontSize: 34, fontWeight: 700 }}>{d.name}</span>
            <span><Pill v={d.verdict} big /></span>
            <span><Pill v={d.afford} big /></span>
          </In>
        ))}
      </div>
      <P d={120} size={34} style={{ marginTop: 40 }}>Pemberwick saves money on these inputs and is still not ready, because nobody has shown how often it misses cancer.</P>
    </Frame>
  );
}

// 7. What decides the answer
function Drivers() {
  const items = ['How accurate the radiologists already are without the tool', 'What one delayed finding costs', 'What share of positive studies an ordinary queue delays'];
  return (
    <Frame kicker="What decides the answer" step="7 / 11">
      <H size={64}>The deciding numbers are the ones nobody has published.</H>
      <P d={10} size={32} style={{ color: C.muted, marginTop: 14 }}>Nikasha halves and then raises by half every unmeasured input, and names the ones that flip the affordability verdict.</P>
      <div style={{ marginTop: 44, display: 'grid', gap: 22 }}>
        {items.map((x, i) => (
          <In key={i} d={40 + i * 24} style={{ display: 'flex', alignItems: 'center', gap: 28, padding: '26px 34px', background: C.paper, borderRadius: 8, borderLeft: `10px solid ${C.warn}` }}>
            <span style={{ fontFamily: MONO, fontSize: 24, color: C.warn, fontWeight: 700, background: C.warnSoft, padding: '6px 14px', borderRadius: 6 }}>PLACEHOLDER</span>
            <span style={{ fontSize: 38 }}>{x}</span>
          </In>
        ))}
      </div>
      <P d={130} size={36} style={{ marginTop: 40, fontWeight: 700, color: C.accent }}>A hospital can measure the first and the third from its own audit data.</P>
    </Frame>
  );
}

// 8. Schema first
function Schema() {
  const files = [['tool.schema.json', 'What an assessor must record about one tool'], ['framework.schema.json', 'Every weight, threshold, anchor and gate'], ['cost-profile.schema.json', 'What a cost calculator hands to a readiness framework'], ['cost-defaults.schema.json', 'Every cost assumption, with its provenance']];
  return (
    <Frame kicker="The schema comes first" step="8 / 11">
      <H size={64}>The code could have been written by anyone. The schema is the contract.</H>
      <div style={{ marginTop: 44, display: 'grid', gap: 16 }}>
        {files.map((x, i) => (
          <In key={x[0]} d={24 + i * 16} style={{ display: 'grid', gridTemplateColumns: '620px 1fr', gap: 26, padding: '20px 30px', background: C.paper, borderRadius: 8 }}>
            <span style={{ fontFamily: MONO, fontSize: 30, color: C.accent }}>{x[0]}</span><span style={{ fontSize: 32 }}>{x[1]}</span>
          </In>
        ))}
      </div>
      <P d={110} size={34} style={{ marginTop: 40 }}>A panel changes Nikasha by editing a data file, and two independent programs that read the same records must reach the same verdict.</P>
    </Frame>
  );
}

// 9. Test bed
function Tests() {
  const f = useCurrentFrame();
  const n = Math.round(interpolate(f, [10, 70], [0, 191], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) }));
  const suites = [['Schema', 37], ['Failure injection', 58], ['Hand-checked cost', 18], ['Random-tool properties', 16], ['Adversarial', 15], ['Golden parity with v0.1', 13], ['Vyaya contract', 11], ['Engine and build', 23]];
  return (
    <Frame kicker="The test bed" step="9 / 11">
      <div style={{ display: 'grid', gridTemplateColumns: '560px 1fr', gap: 60, alignItems: 'start' }}>
        <div>
          <div style={{ fontFamily: SERIF, fontSize: 220, fontWeight: 700, color: C.accent, lineHeight: 1 }}>{n}</div>
          <P size={38}>tests pass, plus a check of the page in a real browser.</P>
          <P d={90} size={30} style={{ color: C.muted, marginTop: 24 }}>Line coverage is 99% and branch coverage is 90%.</P>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {suites.map((s, i) => (
            <In key={s[0]} d={20 + i * 8} style={{ padding: '18px 24px', background: C.paper, borderRadius: 8, display: 'flex', justifyContent: 'space-between', fontSize: 28 }}>
              <span>{s[0]}</span><span style={{ fontFamily: MONO, color: C.accent }}>{s[1]}</span>
            </In>
          ))}
        </div>
      </div>
      <In d={110} style={{ marginTop: 44, padding: '24px 32px', background: C.accentSoft, borderRadius: 8, fontSize: 34, lineHeight: 1.4 }}>
        It has already found five problems the first version missed. Four are fixed, and the fifth is a weighting question that is now pinned for the stakeholder panel.
      </In>
    </Frame>
  );
}

// 10. India first
function India() {
  return (
    <Frame kicker="Why India first" step="10 / 11">
      <H size={80} style={{ maxWidth: 1500 }}>What works under Indian constraints can be carried anywhere.</H>
      <P d={24} size={38} style={{ marginTop: 44, maxWidth: 1500 }}>High volumes, few radiologists, uneven power prices and small validation budgets make the hard cases common here.</P>
      <P d={48} size={38} style={{ marginTop: 26, maxWidth: 1500 }}>Every Indian figure is data, not code. Tariffs, grid carbon, cost defaults and the wording of the legal gates can be replaced for another health system.</P>
    </Frame>
  );
}

// 11. End card
function End() {
  return (
    <Frame step="11 / 11">
      <div style={{ marginTop: 90 }}>
        <H size={96} style={{ color: C.accent }}>Open source, and open to checking.</H>
        <In d={20} style={{ marginTop: 50, fontFamily: MONO, fontSize: 40, lineHeight: 1.7 }}>
          <div>github.com/agravaaniresearch/nikasha</div>
          <div>github.com/agravaaniresearch/vyaya</div>
        </In>
        <P d={44} size={34} style={{ marginTop: 50, color: C.muted, maxWidth: 1500 }}>Everything shown is a working example on synthetic data. The sample tools are fictional, the weights are placeholders, and nothing here is clinically validated.</P>
        <P d={60} size={34} style={{ marginTop: 26 }}>Designed by Dr Abhishek Puri, Agravaani Research.</P>
      </div>
    </Frame>
  );
}

export const SCENES = [
  [Title, 150], [Gap, 230], [Two, 260], [Readiness, 330], [Layers, 330], [Axes, 300],
  [Drivers, 320], [Schema, 290], [Tests, 300], [India, 260], [End, 240]
];
export const DURATION = SCENES.reduce((a, s) => a + s[1], 0) - T * (SCENES.length - 1);

export function Explainer() {
  const out = [];
  SCENES.forEach(([S, d], i) => {
    out.push(<TransitionSeries.Sequence key={'s' + i} durationInFrames={d}><S /></TransitionSeries.Sequence>);
    if (i < SCENES.length - 1) {
      const p = i % 3 === 2 ? slide({ direction: 'from-right' }) : fade();
      out.push(<TransitionSeries.Transition key={'t' + i} presentation={p} timing={linearTiming({ durationInFrames: T })} />);
    }
  });
  return <AbsoluteFill style={{ background: C.bg }}><TransitionSeries>{out}</TransitionSeries></AbsoluteFill>;
}
