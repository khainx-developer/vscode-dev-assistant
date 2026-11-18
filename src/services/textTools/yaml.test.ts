import * as assert from 'assert';
import { jsonToYaml, yamlToJson } from './yaml';

suite('jsonToYaml', () => {
  test('simpleObject', () => {
    const out = jsonToYaml('{"name":"Ada","n":1}');
    assert.ok(out.includes('name: Ada'));
    assert.ok(/'?n'?:\s*1/.test(out));
    assert.deepStrictEqual(JSON.parse(yamlToJson(out)), { name: 'Ada', n: 1 });
  });

  test('nestedArraysAndObjects', () => {
    const out = jsonToYaml('{"a":[1,{"b":true}],"c":{"d":null}}');
    assert.ok(out.includes('a:'));
    assert.ok(out.includes('- 1'));
    assert.ok(out.includes('b: true'));
    assert.ok(out.includes('d: null'));
  });

  test('nullBooleansNumbers', () => {
    const out = jsonToYaml('{"a":null,"b":true,"c":false,"d":3.14,"e":0}');
    assert.ok(out.includes('a: null'));
    assert.ok(out.includes('b: true'));
    assert.ok(out.includes('c: false'));
    assert.ok(out.includes('d: 3.14'));
    assert.ok(out.includes('e: 0'));
  });

  test('unicode', () => {
    const out = jsonToYaml('{"msg":"café 日本語"}');
    assert.ok(out.includes('café 日本語'));
  });

  test('misreadStrings_roundTrip', () => {
    const json = JSON.stringify({
      yes: 'yes',
      num: '123',
      nul: 'null',
      tru: 'true',
      multi: 'line1\nline2',
    });
    const yaml = jsonToYaml(json);
    // Values (and ambiguous keys like yes) must be quoted / block-styled.
    assert.ok(/'yes'|"yes"/.test(yaml));
    assert.ok(/'123'|"123"/.test(yaml));
    assert.ok(/'null'|"null"/.test(yaml));
    assert.ok(/'true'|"true"/.test(yaml));
    assert.ok(/\|-|\|/.test(yaml) || /\\n/.test(yaml));
    const back = JSON.parse(yamlToJson(yaml));
    assert.deepStrictEqual(back, {
      yes: 'yes',
      num: '123',
      nul: 'null',
      tru: 'true',
      multi: 'line1\nline2',
    });
  });

  test('keyOrderPreserved', () => {
    const yaml = jsonToYaml('{"z":1,"a":2,"m":3}');
    const z = yaml.indexOf('z:');
    const a = yaml.indexOf('a:');
    const m = yaml.indexOf('m:');
    assert.ok(z < a && a < m);
  });

  test('invalidJson_includesPosition', () => {
    assert.throws(() => jsonToYaml('{bad'), /position|JSON|Unexpected/i);
  });

  test('emptyInput_throws', () => {
    assert.throws(() => jsonToYaml(''), /Paste JSON/);
    assert.throws(() => jsonToYaml('   \n'), /Paste JSON/);
  });
});

suite('yamlToJson', () => {
  test('simpleObject', () => {
    const out = yamlToJson('name: Ada\nn: 1\n');
    assert.deepStrictEqual(JSON.parse(out), { name: 'Ada', n: 1 });
  });

  test('nestedArraysAndObjects', () => {
    const out = yamlToJson('a:\n  - 1\n  - b: true\nc:\n  d: null\n');
    assert.deepStrictEqual(JSON.parse(out), { a: [1, { b: true }], c: { d: null } });
  });

  test('nullBooleansNumbers', () => {
    const out = yamlToJson('a: null\nb: true\nc: false\nd: 3.14\ne: 0\n');
    assert.deepStrictEqual(JSON.parse(out), { a: null, b: true, c: false, d: 3.14, e: 0 });
  });

  test('unicode', () => {
    const out = yamlToJson('msg: café 日本語\n');
    assert.deepStrictEqual(JSON.parse(out), { msg: 'café 日本語' });
  });

  test('anchorsAndAliasesResolved', () => {
    const out = yamlToJson('x: &id\n  a: 1\ny: *id\n');
    assert.deepStrictEqual(JSON.parse(out), { x: { a: 1 }, y: { a: 1 } });
  });

  test('multiDocument_becomesArray', () => {
    const out = yamlToJson('a: 1\n---\nb: 2\n');
    assert.deepStrictEqual(JSON.parse(out), [{ a: 1 }, { b: 2 }]);
  });

  test('commentOnly_throws', () => {
    assert.throws(() => yamlToJson('# just a comment\n'), /Paste YAML/);
  });

  test('jsFunctionTag_rejected', () => {
    assert.throws(
      () => yamlToJson('evil: !!js/function "function () { return 1; }"\n'),
      /Invalid YAML|unknown tag/i,
    );
  });

  test('invalidYaml_reportsLine', () => {
    assert.throws(() => yamlToJson(':\n  - [\n'), /line \d+/i);
  });

  test('emptyInput_throws', () => {
    assert.throws(() => yamlToJson(''), /Paste YAML/);
    assert.throws(() => yamlToJson('   \n\n'), /Paste YAML/);
  });

  test('timestamp_becomesIsoString', () => {
    const out = yamlToJson('when: 2024-01-15T12:00:00Z\n');
    const parsed = JSON.parse(out) as { when: string };
    assert.strictEqual(parsed.when, '2024-01-15T12:00:00.000Z');
  });
});
