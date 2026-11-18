import * as assert from 'assert';
import { createHash } from 'crypto';
import { hashText } from './hash';

suite('hashText', () => {
  test('empty_knownVectors', () => {
    assert.strictEqual(hashText('md5', ''), 'd41d8cd98f00b204e9800998ecf8427e');
    assert.strictEqual(hashText('sha1', ''), 'da39a3ee5e6b4b0d3255bfef95601890afd80709');
    assert.strictEqual(
      hashText('sha256', ''),
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  test('abc_knownVectors', () => {
    assert.strictEqual(hashText('md5', 'abc'), '900150983cd24fb0d6963f7d28e17f72');
    assert.strictEqual(hashText('sha1', 'abc'), 'a9993e364706816aba3e25717850c26c9cd0d89d');
    assert.strictEqual(
      hashText('sha256', 'abc'),
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  test('abc_sha512_knownVector', () => {
    // NIST / Node crypto: createHash('sha512').update('abc','utf8').digest('hex')
    assert.strictEqual(
      hashText('sha512', 'abc'),
      'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
    );
  });

  test('multiByteUtf8_hashesBytesNotChars', () => {
    assert.strictEqual(
      hashText('sha256', 'café'),
      '850f7dc43910ff890f8879c0ed26fe697c93a067ad93a7d50f466a7028a9bf4e',
    );
  });

  test('trailingNewline_changesDigest', () => {
    const without = hashText('md5', 'abc');
    const withNewline = hashText('md5', 'abc\n');
    assert.strictEqual(without, '900150983cd24fb0d6963f7d28e17f72');
    assert.strictEqual(withNewline, '0bee89b07a248e27c83fc3d5951213c1');
    assert.notStrictEqual(without, withNewline);
  });

  test('all_printsFourLabelledLines', () => {
    const out = hashText('all', 'abc');
    const lines = out.split('\n');
    assert.strictEqual(lines.length, 4);
    assert.strictEqual(
      lines[0],
      'SHA-256: ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    assert.strictEqual(lines[1], 'SHA-1: a9993e364706816aba3e25717850c26c9cd0d89d');
    assert.strictEqual(lines[2], 'MD5: 900150983cd24fb0d6963f7d28e17f72');
    assert.strictEqual(
      lines[3],
      'SHA-512: ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
    );
  });

  test('unknownAlgorithm_throws', () => {
    assert.throws(() => hashText('blake2b', 'x'), /Unknown hash algorithm/);
  });

  test('unavailableAlgorithm_throwsForSingle', () => {
    assert.throws(
      () =>
        hashText('md5', 'x', () => {
          throw new Error('disabled');
        }),
      /MD5 is unavailable in this environment/,
    );
  });

  test('unavailableAlgorithm_markedInAll', () => {
    const out = hashText('all', 'abc', (algo, input) => {
      if (algo === 'md5') {
        throw new Error('disabled');
      }
      return createHash(algo).update(input, 'utf8').digest('hex');
    });
    const lines = out.split('\n');
    assert.strictEqual(lines.length, 4);
    assert.ok(lines[0].startsWith('SHA-256: ba7816bf'));
    assert.ok(lines[1].startsWith('SHA-1: a9993e36'));
    assert.strictEqual(lines[2], 'MD5: unavailable in this environment');
    assert.ok(lines[3].startsWith('SHA-512: ddaf35a1'));
  });
});
