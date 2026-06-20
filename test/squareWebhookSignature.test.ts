import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSquareSignature,
  verifySquareWebhookSignature,
} from '../src/adapters/square/webhookSignature';

/**
 * A pinned known-good vector. The signature below was computed with the
 * documented Square scheme — HMAC-SHA256 over (notificationUrl + rawBody),
 * keyed by the signature key, base64. It is hard-coded (not recomputed from
 * the implementation) so that any drift in the algorithm — wrong order, wrong
 * digest, hashing a re-serialized body — breaks this test instead of silently
 * agreeing with a broken verifier.
 */
const KEY = 'wh_sig_key_EXAMPLE_do_not_use_in_prod';
const URL = 'https://api.example.com/api/square/webhook';
const RAW_BODY = '{"merchant_id":"M1","type":"payment.updated","event_id":"evt_test_123"}';
const GOOD_SIG = 'NFTNCgZyLWkqsoPzgxAOh1XSRzr+h86zzQI/RTTldNA=';

test('computeSquareSignature matches the pinned known-good vector', () => {
  assert.equal(computeSquareSignature(KEY, URL, RAW_BODY), GOOD_SIG);
});

test('verify accepts a correctly signed payload', () => {
  assert.equal(
    verifySquareWebhookSignature({
      signatureKey: KEY,
      notificationUrl: URL,
      rawBody: RAW_BODY,
      signatureHeader: GOOD_SIG,
    }),
    true,
  );
});

test('verify rejects a tampered body (even a single byte)', () => {
  const tampered = RAW_BODY.replace('evt_test_123', 'evt_test_124');
  assert.equal(
    verifySquareWebhookSignature({
      signatureKey: KEY,
      notificationUrl: URL,
      rawBody: tampered,
      signatureHeader: GOOD_SIG,
    }),
    false,
  );
});

test('verify rejects a re-serialized body whose bytes differ', () => {
  // Same logical JSON, different bytes (spaces added). The signature is over
  // bytes, so this must fail — this is exactly the JSON.parse/re-stringify trap.
  const reSerialized = JSON.stringify(JSON.parse(RAW_BODY), null, 2);
  assert.notEqual(reSerialized, RAW_BODY);
  assert.equal(
    verifySquareWebhookSignature({
      signatureKey: KEY,
      notificationUrl: URL,
      rawBody: reSerialized,
      signatureHeader: GOOD_SIG,
    }),
    false,
  );
});

test('verify rejects a tampered signature', () => {
  assert.equal(
    verifySquareWebhookSignature({
      signatureKey: KEY,
      notificationUrl: URL,
      rawBody: RAW_BODY,
      signatureHeader: GOOD_SIG.slice(0, -2) + 'AA',
    }),
    false,
  );
});

test('verify rejects the wrong signature key', () => {
  assert.equal(
    verifySquareWebhookSignature({
      signatureKey: 'a-different-key',
      notificationUrl: URL,
      rawBody: RAW_BODY,
      signatureHeader: GOOD_SIG,
    }),
    false,
  );
});

test('verify rejects the wrong notification URL', () => {
  assert.equal(
    verifySquareWebhookSignature({
      signatureKey: KEY,
      notificationUrl: URL + '/',
      rawBody: RAW_BODY,
      signatureHeader: GOOD_SIG,
    }),
    false,
  );
});

test('verify rejects a missing signature header without throwing', () => {
  assert.equal(
    verifySquareWebhookSignature({
      signatureKey: KEY,
      notificationUrl: URL,
      rawBody: RAW_BODY,
      signatureHeader: null,
    }),
    false,
  );
});

test('verify accepts a Buffer raw body identically to a string', () => {
  assert.equal(
    verifySquareWebhookSignature({
      signatureKey: KEY,
      notificationUrl: URL,
      rawBody: Buffer.from(RAW_BODY, 'utf8'),
      signatureHeader: GOOD_SIG,
    }),
    true,
  );
});
