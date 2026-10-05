import { describe, expect, it } from 'vitest';
import { extractHeadcount, matchKeywords, recommend } from './recommend';

describe('matchKeywords', () => {
  it('matches English on word boundaries and Japanese as substrings', () => {
    const keywords = { en: ['play', 'tab'], ja: ['遊'] };
    expect(matchKeywords('Let us PLAY!', keywords)).toEqual(['play']);
    expect(matchKeywords('a big display', keywords)).toEqual([]);
    expect(matchKeywords('stable', keywords)).toEqual([]);
    expect(matchKeywords('みんなで遊ぶ', keywords)).toEqual(['遊']);
  });
});

describe('extractHeadcount', () => {
  it('finds the largest head count in en and ja', () => {
    expect(extractHeadcount('a quiz for 200 people')).toBe(200);
    expect(extractHeadcount('4 players, maybe 8 players')).toBe(8);
    expect(extractHeadcount('参加者は50人くらい')).toBe(50);
    expect(extractHeadcount('no numbers')).toBeUndefined();
  });
});

describe('recommend', () => {
  it.each([
    ['A live poll where the audience votes on their phones', 'room-quiz-poll', 'partykit'],
    ['collaborative drawing on a big screen', 'stroke-stream', 'webrtc'],
    ['tap your phone to launch fireworks', 'particle-blast', 'partykit'],
    ['send comments that fly across the screen', 'type-throw', 'partykit'],
    ['phones as gamepads for a couch game', 'virtual-controller', 'webrtc'],
    ['tilt the phone to steer a ball', 'motion-sensor', 'webrtc'],
    ['one scene across three monitors on the same computer', 'local-multi-display', 'broadcast'],
  ])('%s -> %s over %s', (text, preset, transport) => {
    const result = recommend(text);
    expect(result.preset).toBe(preset);
    expect(result.transport).toBe(transport);
    expect(result.fallback).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it.each([
    ['会場のみんなでクイズに回答する', 'room-quiz-poll'],
    ['スマホでお絵かきして大画面に表示', 'stroke-stream'],
    ['スマホを傾けて操作するレースゲーム', 'motion-sensor'],
    ['タップで花火を打ち上げる演出', 'particle-blast'],
    ['複数のモニターにまたがるビデオウォール', 'local-multi-display'],
  ])('Japanese: %s -> %s', (text, preset) => {
    const result = recommend(text, 'ja');
    expect(result.preset).toBe(preset);
    expect(result.reasons[0]).toContain('に一致');
  });

  it('honors transport hints the preset supports', () => {
    expect(recommend('a quiz that must work offline in one browser').transport).toBe('broadcast');
    expect(recommend('drawing app, but deploy on Cloudflare').transport).toBe('partykit');
    expect(recommend('低遅延なクイズ').transport).toBe('webrtc');
  });

  it('explains why Firebase is not used for messaging presets', () => {
    const result = recommend('a poll app, we already use Firebase');
    expect(result.preset).toBe('room-quiz-poll');
    expect(result.transport).toBe('partykit');
    expect(result.reasons.join(' ')).toMatch(/Firebase has no ephemeral messaging/);
  });

  it('moves large rooms off the WebRTC star', () => {
    const result = recommend('low latency drawing wall for 120 people');
    expect(result.preset).toBe('stroke-stream');
    expect(result.transport).toBe('partykit');
    expect(result.reasons.at(-1)).toMatch(/120 people is too many/);
  });

  it('falls back to a general default when nothing matches', () => {
    const result = recommend('something nice');
    expect(result).toMatchObject({ fallback: true, preset: 'room-quiz-poll', transport: 'partykit', pairing: 'pin', ranking: [] });
  });

  it('ranks every matching preset', () => {
    const result = recommend('a drawing game with a controller and a gamepad');
    // controller + gamepad = 2, plus the weak "game" = 0.4.
    expect(result.ranking[0]).toMatchObject({ preset: 'virtual-controller', score: 2.4 });
    expect(result.ranking.map((r) => r.preset)).toContain('stroke-stream');
  });
});
