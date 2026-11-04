import * as assert from 'assert';
import { ErrorClassifier } from './errorClassifier';

suite('ErrorClassifier', () => {
  test('ErrorClassifier_classify_returnsAuthExpired_on401', () => {
    const result = ErrorClassifier.classify({ status: 401, message: 'Bad credentials' });

    assert.deepStrictEqual(result, { category: 'auth-expired', detail: 'Bad credentials' });
  });

  test('ErrorClassifier_classify_returnsRateLimited_on403WithZeroRemaining', () => {
    const result = ErrorClassifier.classify({
      status: 403,
      message: 'API rate limit exceeded',
      response: {
        headers: {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': '1700000000',
        },
      },
    });

    assert.strictEqual(result.category, 'rate-limited');
    assert.strictEqual(result.detail, 'API rate limit exceeded');
    assert.strictEqual(result.resetAt, new Date(1700000000 * 1000).toISOString());
  });

  test('ErrorClassifier_classify_returnsInvalidEntry_on404', () => {
    const result = ErrorClassifier.classify({ status: 404, message: 'Not Found' });

    assert.deepStrictEqual(result, { category: 'invalid-entry', detail: 'Not Found' });
  });

  test('ErrorClassifier_classify_returnsNetwork_onUnrecognizedError', () => {
    const result = ErrorClassifier.classify({ status: 500, message: 'Internal Server Error' });

    assert.deepStrictEqual(result, { category: 'network', detail: 'Internal Server Error' });
  });

  test('ErrorClassifier_classify_returnsNetwork_onTypeError', () => {
    const result = ErrorClassifier.classify(new TypeError('fetch failed'));

    assert.deepStrictEqual(result, { category: 'network', detail: 'fetch failed' });
  });
});
