const dedent = require("dedent-js");
const fs = require("fs");
const path = require("path");
const process = require("process");

const lint = require("../lib/linter-lilypond").provideLinter().lint;

describe("linter-lilypond", () => {
  const preamble = '\\version "2.24.4"\n';

  beforeEach(() => {
    waitsForPromise(() => atom.packages.activatePackage("linter-lilypond"));
  });

  // These tests pass locally, but not on GitHub Actions.
  if (process.env.CI !== "true") {

  describe("LilyPond linter", () => {
    it("lints a valid file", () => {
      const filePath = path.join(__dirname, "test.ly");
      const file = fs.openSync(filePath, "w");
      fs.writeSync(file, `${preamble}{ c' e' g' e' }`);
      fs.closeSync(file);
      waitsForPromise(() => atom.workspace.open(filePath).then(editor => {
        waitsForPromise(() => lint(editor).then(messages => {
          expect(messages === null || messages.length === 0).toBe(true);
          fs.unlinkSync(filePath);
        }));
      }));
    });

    it("lints a file without a \\version statement", () => {
      const filePath = path.join(__dirname, "test.ly");
      const file = fs.openSync(filePath, "w");
      fs.writeSync(file, "{ c' e' g' e' }");
      fs.closeSync(file);
      waitsForPromise(() => atom.workspace.open(filePath).then(editor => {
        waitsForPromise(() => lint(editor).then(messages => {
          expect(messages.length).toBe(1);
          expect(messages[0].severity).toBe("warning");
          expect(messages[0].excerpt).toMatch(/^no \\version statement found\b/);
          expect(messages[0].location.file).toBe(filePath);
          expect(messages[0].location.position).toEqual([[0, 0], [0, 0]]);
          fs.unlinkSync(filePath);
        }));
      }));
    });

    it("deletes output MIDI file", () => {
      const filePath = path.join(__dirname, "test.ly");
      const file = fs.openSync(filePath, "w");
      fs.writeSync(file, `${preamble}\\score { { c' } \\midi { } }`);
      fs.closeSync(file);
      waitsForPromise(() => atom.workspace.open(filePath).then(editor => {
        waitsForPromise(() => lint(editor).then(messages => {
          expect(messages === null || messages.length === 0).toBe(true);
          const outputFilePath = path.join(__dirname, "-.midi");
          expect(() => fs.unlinkSync(outputFilePath)).toThrow(`ENOENT: no such file or directory, unlink '${outputFilePath}'`);
          fs.unlinkSync(filePath);
        }));
      }));
    });

    it("lints an invalid note name", () => {
      const filePath = path.join(__dirname, "test.ly");
      const file = fs.openSync(filePath, "w");
      fs.writeSync(file, `${preamble}{ error }`);
      fs.closeSync(file);
      waitsForPromise(() => atom.workspace.open(filePath).then(editor => {
        waitsForPromise(() => lint(editor).then(messages => {
          expect(messages.length).toBe(1);
          expect(messages[0].severity).toBe("error");
          // The excerpt should be "not a note name: error", but this varies by
          // LilyPond version.
          expect(messages[0].location.file).toBe(filePath);
          expect(messages[0].location.position).toEqual([[1, 2], [1, 7]]);
          fs.unlinkSync(filePath);
        }));
      }));
    });

    it("lints an error in an included file", () => {
      const includeFilePath = path.join(__dirname, "include.ly");
      const includeFile = fs.openSync(includeFilePath, "w");
      fs.writeSync(includeFile, "{ error }");
      fs.closeSync(includeFile);
      const testFilePath = path.join(__dirname, "test.ly");
      const testFile = fs.openSync(testFilePath, "w");
      fs.writeSync(testFile, `${preamble}\\include "include.ly"`);
      fs.closeSync(testFile);
      waitsForPromise(() => atom.workspace.open(testFilePath).then(editor => {
        waitsForPromise(() => lint(editor).then(messages => {
          expect(messages.length).toBe(1);
          expect(messages[0].severity).toBe("error");
          // The excerpt should be "not a note name: error", but this varies by
          // LilyPond version.
          expect(messages[0].location.file).toBe(includeFilePath);
          expect(messages[0].location.position).toEqual([[0, 2], [0, 2]]);
          fs.unlinkSync(includeFilePath);
          fs.unlinkSync(testFilePath);
        }));
      }));
    });

    it("doesn’t create files when lilypond-book-preamble.ly is used", () => {
      const filePath = path.join(__dirname, "test.ly");
      const file = fs.openSync(filePath, "w");
      fs.writeSync(file, `${preamble}\\include "lilypond-book-preamble.ly" { c }`);
      fs.closeSync(file);
      waitsForPromise(() => atom.workspace.open(filePath).then(editor => {
        waitsForPromise(() => lint(editor).then(messages => {
          expect(messages === null || messages.length === 0).toBe(true);
          const outputFileNames = [
            "--1.eps",
            "--1.pdf",
            "--systems.count",
            "--systems.tex",
            "--systems.texi",
            "-.pdf"
          ];
          for (const outputFileName of outputFileNames) {
            const outputFilePath = path.join(__dirname, outputFileName);
            expect(() => fs.unlinkSync(outputFilePath)).toThrow(`ENOENT: no such file or directory, unlink '${outputFilePath}'`);
          }
          fs.unlinkSync(filePath);
        }));
      }));
    });
  });

  }

  describe("LilyPond grammar", () => {
    let grammar;

    beforeEach(() => {
      grammar = atom.grammars.grammarForScopeName("source.lilypond");
    });

    it("is defined", () => {
      expect(grammar.scopeName).toBe("source.lilypond");
    });

    it("tokenizes comments", () => {
      const lines = grammar.tokenizeLines(dedent`
        %{
        comment
        %}
        % comment
      `);
      let tokens = lines[0];
      expect(tokens.length).toBe(1);
      expect(tokens[0]).toEqual({value: "%{", scopes: ["source.lilypond", "comment.block.lilypond", "punctuation.definition.comment.begin.lilypond"]});
      tokens = lines[1];
      expect(tokens.length).toBe(1);
      expect(tokens[0]).toEqual({value: "comment", scopes: ["source.lilypond", "comment.block.lilypond"]});
      tokens = lines[2];
      expect(tokens.length).toBe(1);
      expect(tokens[0]).toEqual({value: "%}", scopes: ["source.lilypond", "comment.block.lilypond", "punctuation.definition.comment.end.lilypond"]});
      tokens = lines[3];
      expect(tokens.length).toBe(2);
      expect(tokens[0]).toEqual({value: "%", scopes: ["source.lilypond", "comment.line.lilypond", "punctuation.definition.comment.lilypond"]});
      expect(tokens[1]).toEqual({value: " comment", scopes: ["source.lilypond", "comment.line.lilypond"]});
    });

    it("tokenizes strings", () => {
      const {tokens} = grammar.tokenizeLine('"characters\\n\\t\\"\\\'\\\\"');
      expect(tokens.length).toBe(8);
      expect(tokens[0]).toEqual({value: '"', scopes: ["source.lilypond", "string.lilypond", "punctuation.definition.string.begin.lilypond"]});
      expect(tokens[1]).toEqual({value: "characters", scopes: ["source.lilypond", "string.lilypond"]});
      expect(tokens[2]).toEqual({value: "\\n", scopes: ["source.lilypond", "string.lilypond", "constant.character.escape.lilypond"]});
      expect(tokens[3]).toEqual({value: "\\t", scopes: ["source.lilypond", "string.lilypond", "constant.character.escape.lilypond"]});
      expect(tokens[4]).toEqual({value: '\\"', scopes: ["source.lilypond", "string.lilypond", "constant.character.escape.lilypond"]});
      expect(tokens[5]).toEqual({value: "\\'", scopes: ["source.lilypond", "string.lilypond", "constant.character.escape.lilypond"]});
      expect(tokens[6]).toEqual({value: "\\\\", scopes: ["source.lilypond", "string.lilypond", "constant.character.escape.lilypond"]});
      expect(tokens[7]).toEqual({value: '"', scopes: ["source.lilypond", "string.lilypond", "punctuation.definition.string.end.lilypond"]});
    });

    it("tokenizes variables", () => {
      const {tokens} = grammar.tokenizeLine("\\foo-bar \\foo-bar-baz");
      expect(tokens.length).toBe(3);
      expect(tokens[0]).toEqual({value: "\\foo-bar", scopes: ["source.lilypond", "variable.other.lilypond"]});
      expect(tokens[1]).toEqual({value: " ", scopes: ["source.lilypond"]});
      expect(tokens[2]).toEqual({value: "\\foo-bar-baz", scopes: ["source.lilypond", "variable.other.lilypond"]});
    });

    it("tokenizes music expressions", () => {
      const lines = grammar.tokenizeLines(dedent`
        \\relative c' {
          c1 2 4 8 16 32 64. 128
          c2*2/3 c~c c2 *%{%}2%{%}
          r8 c[ r c] s2 | R1
          c8-^ c-+ c-- c-! c-> c-. c4-_
          c\\< c\\! c\\> c\\!
          <c e-> g\\1>2q
          << e1 \\\\ c >>
          c8( c) c\\( c\\) c\\=1( c\\=1) c\\=%{%}"label"\\( c\\="label"%{%}\\)
          \\[ c2 c \\]
          c4^"up" c_"down" c2-"default"
          ces'!4 ces,? c='2
        }
      `);

      let tokens = lines[0];
      expect(tokens.length).toBe(6);
      expect(tokens[0]).toEqual({value: "\\relative", scopes: ["source.lilypond", "support.function.lilypond"]});
      expect(tokens[1]).toEqual({value: " ", scopes: ["source.lilypond"]});
      expect(tokens[2]).toEqual({value: "c", scopes: ["source.lilypond", "text.note-name.lilypond"]});
      expect(tokens[3]).toEqual({value: "'", scopes: ["source.lilypond", "punctuation.apostrophe.lilypond"]});
      expect(tokens[4]).toEqual({value: " ", scopes: ["source.lilypond"]});
      expect(tokens[5]).toEqual({value: "{", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});

      tokens = lines[1];
      expect(tokens.length).toBe(18);
      expect(tokens[0]).toEqual({value: "  ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[1]).toEqual({value: "c", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.note-name.lilypond"]});
      expect(tokens[2]).toEqual({value: "1", scopes: ["source.lilypond", "meta.expression-block.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[3]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[4]).toEqual({value: "2", scopes: ["source.lilypond", "meta.expression-block.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[5]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[6]).toEqual({value: "4", scopes: ["source.lilypond", "meta.expression-block.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[7]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[8]).toEqual({value: "8", scopes: ["source.lilypond", "meta.expression-block.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[9]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[10]).toEqual({value: "16", scopes: ["source.lilypond", "meta.expression-block.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[11]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[12]).toEqual({value: "32", scopes: ["source.lilypond", "meta.expression-block.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[13]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[14]).toEqual({value: "64", scopes: ["source.lilypond", "meta.expression-block.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[15]).toEqual({value: ".", scopes: ["source.lilypond", "meta.expression-block.lilypond", "punctuation.dot.lilypond"]});
      expect(tokens[16]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[17]).toEqual({value: "128", scopes: ["source.lilypond", "meta.expression-block.lilypond", "constant.numeric.integer.lilypond"]});

      tokens = lines[2];
      expect(tokens.length).toBe(21);
      expect(tokens[0]).toEqual({value: "  ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[1]).toEqual({value: "c", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.note-name.lilypond"]});
      expect(tokens[2]).toEqual({value: "2", scopes: ["source.lilypond", "meta.expression-block.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[3]).toEqual({value: "*", scopes: ["source.lilypond", "meta.expression-block.lilypond", "keyword.operator.multiplication.lilypond"]});
      expect(tokens[4]).toEqual({value: "2", scopes: ["source.lilypond", "meta.expression-block.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[5]).toEqual({value: "/", scopes: ["source.lilypond", "meta.expression-block.lilypond", "keyword.operator.forward-slash.lilypond"]});
      expect(tokens[6]).toEqual({value: "3", scopes: ["source.lilypond", "meta.expression-block.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[7]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[8]).toEqual({value: "c", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.note-name.lilypond"]});
      expect(tokens[9]).toEqual({value: "~", scopes: ["source.lilypond", "meta.expression-block.lilypond", "punctuation.tilde.lilypond"]});
      expect(tokens[10]).toEqual({value: "c", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.note-name.lilypond"]});
      expect(tokens[11]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[12]).toEqual({value: "c", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.note-name.lilypond"]});
      expect(tokens[13]).toEqual({value: "2", scopes: ["source.lilypond", "meta.expression-block.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[14]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[15]).toEqual({value: "*", scopes: ["source.lilypond", "meta.expression-block.lilypond", "keyword.operator.multiplication.lilypond"]});
      expect(tokens[16]).toEqual({value: "%{", scopes: ["source.lilypond", "meta.expression-block.lilypond", "comment.block.lilypond", "punctuation.definition.comment.begin.lilypond"]});
      expect(tokens[17]).toEqual({value: "%}", scopes: ["source.lilypond", "meta.expression-block.lilypond", "comment.block.lilypond", "punctuation.definition.comment.end.lilypond"]});
      expect(tokens[18]).toEqual({value: "2", scopes: ["source.lilypond", "meta.expression-block.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[19]).toEqual({value: "%{", scopes: ["source.lilypond", "meta.expression-block.lilypond", "comment.block.lilypond", "punctuation.definition.comment.begin.lilypond"]});
      expect(tokens[20]).toEqual({value: "%}", scopes: ["source.lilypond", "meta.expression-block.lilypond", "comment.block.lilypond", "punctuation.definition.comment.end.lilypond"]});

      tokens = lines[3];
      expect(tokens.length).toBe(19);
      expect(tokens[0]).toEqual({value: "  ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[1]).toEqual({value: "r", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.rest.lilypond"]});
      expect(tokens[2]).toEqual({value: "8", scopes: ["source.lilypond", "meta.expression-block.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[3]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[4]).toEqual({value: "c", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.note-name.lilypond"]});
      expect(tokens[5]).toEqual({value: "[", scopes: ["source.lilypond", "meta.expression-block.lilypond", "keyword.operator.beam.begin.lilypond"]});
      expect(tokens[6]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[7]).toEqual({value: "r", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.rest.lilypond"]});
      expect(tokens[8]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[9]).toEqual({value: "c", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.note-name.lilypond"]});
      expect(tokens[10]).toEqual({value: "]", scopes: ["source.lilypond", "meta.expression-block.lilypond", "keyword.operator.beam.end.lilypond"]});
      expect(tokens[11]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[12]).toEqual({value: "s", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.rest.lilypond"]});
      expect(tokens[13]).toEqual({value: "2", scopes: ["source.lilypond", "meta.expression-block.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[14]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[15]).toEqual({value: "|", scopes: ["source.lilypond", "meta.expression-block.lilypond", "keyword.operator.bar-check.lilypond"]});
      expect(tokens[16]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[17]).toEqual({value: "R", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.rest.lilypond"]});
      expect(tokens[18]).toEqual({value: "1", scopes: ["source.lilypond", "meta.expression-block.lilypond", "constant.numeric.integer.lilypond"]});

      tokens = lines[4];
      expect(tokens.length).toBe(30);
      expect(tokens[0]).toEqual({value: "  ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[1]).toEqual({value: "c", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.note-name.lilypond"]});
      expect(tokens[2]).toEqual({value: "8", scopes: ["source.lilypond", "meta.expression-block.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[3]).toEqual({value: "-", scopes: ["source.lilypond", "meta.expression-block.lilypond", "punctuation.hyphen.lilypond"]});
      expect(tokens[4]).toEqual({value: "^", scopes: ["source.lilypond", "meta.expression-block.lilypond", "punctuation.caret.lilypond"]});
      expect(tokens[5]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[6]).toEqual({value: "c", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.note-name.lilypond"]});
      expect(tokens[7]).toEqual({value: "-", scopes: ["source.lilypond", "meta.expression-block.lilypond", "punctuation.hyphen.lilypond"]});
      expect(tokens[8]).toEqual({value: "+", scopes: ["source.lilypond", "meta.expression-block.lilypond", "punctuation.plus-sign.lilypond"]});
      expect(tokens[9]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[10]).toEqual({value: "c", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.note-name.lilypond"]});
      expect(tokens[11]).toEqual({value: "-", scopes: ["source.lilypond", "meta.expression-block.lilypond", "punctuation.hyphen.lilypond"]});
      expect(tokens[12]).toEqual({value: "-", scopes: ["source.lilypond", "meta.expression-block.lilypond", "punctuation.hyphen.lilypond"]});
      expect(tokens[13]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[14]).toEqual({value: "c", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.note-name.lilypond"]});
      expect(tokens[15]).toEqual({value: "-", scopes: ["source.lilypond", "meta.expression-block.lilypond", "punctuation.hyphen.lilypond"]});
      expect(tokens[16]).toEqual({value: "!", scopes: ["source.lilypond", "meta.expression-block.lilypond", "punctuation.exclamation-point.lilypond"]});
      expect(tokens[17]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[18]).toEqual({value: "c", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.note-name.lilypond"]});
      expect(tokens[19]).toEqual({value: "-", scopes: ["source.lilypond", "meta.expression-block.lilypond", "punctuation.hyphen.lilypond"]});
      expect(tokens[20]).toEqual({value: ">", scopes: ["source.lilypond", "meta.expression-block.lilypond", "punctuation.greater-than-sign.lilypond"]});
      expect(tokens[21]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[22]).toEqual({value: "c", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.note-name.lilypond"]});
      expect(tokens[23]).toEqual({value: "-", scopes: ["source.lilypond", "meta.expression-block.lilypond", "punctuation.hyphen.lilypond"]});
      expect(tokens[24]).toEqual({value: ".", scopes: ["source.lilypond", "meta.expression-block.lilypond", "punctuation.dot.lilypond"]});
      expect(tokens[25]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[26]).toEqual({value: "c", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.note-name.lilypond"]});
      expect(tokens[27]).toEqual({value: "4", scopes: ["source.lilypond", "meta.expression-block.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[28]).toEqual({value: "-", scopes: ["source.lilypond", "meta.expression-block.lilypond", "punctuation.hyphen.lilypond"]});
      expect(tokens[29]).toEqual({value: "_", scopes: ["source.lilypond", "meta.expression-block.lilypond", "punctuation.underscore.lilypond"]});

      tokens = lines[5];
      expect(tokens.length).toBe(12);
      expect(tokens[0]).toEqual({value: "  ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[1]).toEqual({value: "c", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.note-name.lilypond"]});
      expect(tokens[2]).toEqual({value: "\\<", scopes: ["source.lilypond", "meta.expression-block.lilypond", "keyword.operator.dynamic-mark.begin.crescendo.lilypond"]});
      expect(tokens[3]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[4]).toEqual({value: "c", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.note-name.lilypond"]});
      expect(tokens[5]).toEqual({value: "\\!", scopes: ["source.lilypond", "meta.expression-block.lilypond", "keyword.operator.dynamic-mark.end.lilypond"]});
      expect(tokens[6]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[7]).toEqual({value: "c", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.note-name.lilypond"]});
      expect(tokens[8]).toEqual({value: "\\>", scopes: ["source.lilypond", "meta.expression-block.lilypond", "keyword.operator.dynamic-mark.begin.decrescendo.lilypond"]});
      expect(tokens[9]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[10]).toEqual({value: "c", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.note-name.lilypond"]});
      expect(tokens[11]).toEqual({value: "\\!", scopes: ["source.lilypond", "meta.expression-block.lilypond", "keyword.operator.dynamic-mark.end.lilypond"]});

      tokens = lines[6];
      expect(tokens.length).toBe(14);
      expect(tokens[0]).toEqual({value: "  ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[1]).toEqual({value: "<", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.chord.lilypond", "punctuation.definition.chord.begin.lilypond"]});
      expect(tokens[2]).toEqual({value: "c", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.chord.lilypond", "text.note-name.lilypond"]});
      expect(tokens[3]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.chord.lilypond"]});
      expect(tokens[4]).toEqual({value: "e", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.chord.lilypond", "text.note-name.lilypond"]});
      expect(tokens[5]).toEqual({value: "-", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.chord.lilypond", "punctuation.hyphen.lilypond"]});
      expect(tokens[6]).toEqual({value: ">", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.chord.lilypond", "punctuation.greater-than-sign.lilypond"]});
      expect(tokens[7]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.chord.lilypond"]});
      expect(tokens[8]).toEqual({value: "g", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.chord.lilypond", "text.note-name.lilypond"]});
      expect(tokens[9]).toEqual({value: "\\", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.chord.lilypond", "keyword.operator.string-number-indicator.lilypond"]});
      expect(tokens[10]).toEqual({value: "1", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.chord.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[11]).toEqual({value: ">", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.chord.lilypond", "punctuation.definition.chord.end.lilypond"]});
      expect(tokens[12]).toEqual({value: "2", scopes: ["source.lilypond", "meta.expression-block.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[13]).toEqual({value: "q", scopes: ["source.lilypond", "meta.expression-block.lilypond", "keyword.operator.chord-repetition.lilypond"]});

      tokens = lines[7];
      expect(tokens.length).toBe(11);
      expect(tokens[0]).toEqual({value: "  ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[1]).toEqual({value: "<<", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.simultaneous-expressions.lilypond", "punctuation.simultaneous-expressions.begin.lilypond"]});
      expect(tokens[2]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.simultaneous-expressions.lilypond"]});
      expect(tokens[3]).toEqual({value: "e", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.simultaneous-expressions.lilypond", "text.note-name.lilypond"]});
      expect(tokens[4]).toEqual({value: "1", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.simultaneous-expressions.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[5]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.simultaneous-expressions.lilypond"]});
      expect(tokens[6]).toEqual({value: "\\\\", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.simultaneous-expressions.lilypond", "meta.separator.simultaneous-expressions.lilypond"]});
      expect(tokens[7]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.simultaneous-expressions.lilypond"]});
      expect(tokens[8]).toEqual({value: "c", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.simultaneous-expressions.lilypond", "text.note-name.lilypond"]});
      expect(tokens[9]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.simultaneous-expressions.lilypond"]});
      expect(tokens[10]).toEqual({value: ">>", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.simultaneous-expressions.lilypond", "punctuation.simultaneous-expressions.end.lilypond"]});

      tokens = lines[8];
      expect(tokens.length).toBe(41);
      expect(tokens[0]).toEqual({value: "  ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[1]).toEqual({value: "c", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.note-name.lilypond"]});
      expect(tokens[2]).toEqual({value: "8", scopes: ["source.lilypond", "meta.expression-block.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[3]).toEqual({value: "(", scopes: ["source.lilypond", "meta.expression-block.lilypond", "keyword.operator.slur.begin.lilypond"]});
      expect(tokens[4]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[5]).toEqual({value: "c", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.note-name.lilypond"]});
      expect(tokens[6]).toEqual({value: ")", scopes: ["source.lilypond", "meta.expression-block.lilypond", "keyword.operator.slur.end.lilypond"]});
      expect(tokens[7]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[8]).toEqual({value: "c", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.note-name.lilypond"]});
      expect(tokens[9]).toEqual({value: "\\(", scopes: ["source.lilypond", "meta.expression-block.lilypond", "keyword.operator.phrasing-slur.begin.lilypond"]});
      expect(tokens[10]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[11]).toEqual({value: "c", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.note-name.lilypond"]});
      expect(tokens[12]).toEqual({value: "\\)", scopes: ["source.lilypond", "meta.expression-block.lilypond", "keyword.operator.phrasing-slur.end.lilypond"]});
      expect(tokens[13]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[14]).toEqual({value: "c", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.note-name.lilypond"]});
      expect(tokens[15]).toEqual({value: "\\=", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.slur-label.lilypond", "entity.punctuation.slur-label.lilypond"]});
      expect(tokens[16]).toEqual({value: "1", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.slur-label.lilypond", "entity.name.slur-label.lilypond"]});
      expect(tokens[17]).toEqual({value: "(", scopes: ["source.lilypond", "meta.expression-block.lilypond", "keyword.operator.slur.begin.lilypond"]});
      expect(tokens[18]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[19]).toEqual({value: "c", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.note-name.lilypond"]});
      expect(tokens[20]).toEqual({value: "\\=", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.slur-label.lilypond", "entity.punctuation.slur-label.lilypond"]});
      expect(tokens[21]).toEqual({value: "1", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.slur-label.lilypond", "entity.name.slur-label.lilypond"]});
      expect(tokens[22]).toEqual({value: ")", scopes: ["source.lilypond", "meta.expression-block.lilypond", "keyword.operator.slur.end.lilypond"]});
      expect(tokens[23]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[24]).toEqual({value: "c", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.note-name.lilypond"]});
      expect(tokens[25]).toEqual({value: "\\=", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.slur-label.lilypond", "entity.punctuation.slur-label.lilypond"]});
      expect(tokens[26]).toEqual({value: "%{", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.slur-label.lilypond", "comment.block.lilypond", "punctuation.definition.comment.begin.lilypond"]});
      expect(tokens[27]).toEqual({value: "%}", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.slur-label.lilypond", "comment.block.lilypond", "punctuation.definition.comment.end.lilypond"]});
      expect(tokens[28]).toEqual({value: '"', scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.slur-label.lilypond", "string.lilypond", "punctuation.definition.string.begin.lilypond"]});
      expect(tokens[29]).toEqual({value: "label", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.slur-label.lilypond", "string.lilypond", "entity.name.slur-label.lilypond"]});
      expect(tokens[30]).toEqual({value: '"', scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.slur-label.lilypond", "string.lilypond", "punctuation.definition.string.end.lilypond"]});
      expect(tokens[31]).toEqual({value: "\\(", scopes: ["source.lilypond", "meta.expression-block.lilypond", "keyword.operator.phrasing-slur.begin.lilypond"]});
      expect(tokens[32]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[33]).toEqual({value: "c", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.note-name.lilypond"]});
      expect(tokens[34]).toEqual({value: "\\=", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.slur-label.lilypond", "entity.punctuation.slur-label.lilypond"]});
      expect(tokens[35]).toEqual({value: '"', scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.slur-label.lilypond", "string.lilypond", "punctuation.definition.string.begin.lilypond"]});
      expect(tokens[36]).toEqual({value: "label", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.slur-label.lilypond", "string.lilypond", "entity.name.slur-label.lilypond"]});
      expect(tokens[37]).toEqual({value: '"', scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.slur-label.lilypond", "string.lilypond", "punctuation.definition.string.end.lilypond"]});
      expect(tokens[38]).toEqual({value: "%{", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.slur-label.lilypond", "comment.block.lilypond", "punctuation.definition.comment.begin.lilypond"]});
      expect(tokens[39]).toEqual({value: "%}", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.slur-label.lilypond", "comment.block.lilypond", "punctuation.definition.comment.end.lilypond"]});
      expect(tokens[40]).toEqual({value: "\\)", scopes: ["source.lilypond", "meta.expression-block.lilypond", "keyword.operator.phrasing-slur.end.lilypond"]});

      tokens = lines[9];
      expect(tokens.length).toBe(9);
      expect(tokens[0]).toEqual({value: "  ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[1]).toEqual({value: "\\[", scopes: ["source.lilypond", "meta.expression-block.lilypond", "invalid.deprecated.ligature.begin.lilypond"]});
      expect(tokens[2]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[3]).toEqual({value: "c", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.note-name.lilypond"]});
      expect(tokens[4]).toEqual({value: "2", scopes: ["source.lilypond", "meta.expression-block.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[5]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[6]).toEqual({value: "c", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.note-name.lilypond"]});
      expect(tokens[7]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[8]).toEqual({value: "\\]", scopes: ["source.lilypond", "meta.expression-block.lilypond", "invalid.deprecated.ligature.end.lilypond"]});

      tokens = lines[10];
      expect(tokens.length).toBe(20);
      expect(tokens[0]).toEqual({value: "  ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[1]).toEqual({value: "c", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.note-name.lilypond"]});
      expect(tokens[2]).toEqual({value: "4", scopes: ["source.lilypond", "meta.expression-block.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[3]).toEqual({value: "^", scopes: ["source.lilypond", "meta.expression-block.lilypond", "punctuation.caret.lilypond"]});
      expect(tokens[4]).toEqual({value: '"', scopes: ["source.lilypond", "meta.expression-block.lilypond", "string.lilypond", "punctuation.definition.string.begin.lilypond"]});
      expect(tokens[5]).toEqual({value: "up", scopes: ["source.lilypond", "meta.expression-block.lilypond", "string.lilypond"]});
      expect(tokens[6]).toEqual({value: '"', scopes: ["source.lilypond", "meta.expression-block.lilypond", "string.lilypond", "punctuation.definition.string.end.lilypond"]});
      expect(tokens[7]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[8]).toEqual({value: "c", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.note-name.lilypond"]});
      expect(tokens[9]).toEqual({value: "_", scopes: ["source.lilypond", "meta.expression-block.lilypond", "punctuation.underscore.lilypond"]});
      expect(tokens[10]).toEqual({value: '"', scopes: ["source.lilypond", "meta.expression-block.lilypond", "string.lilypond", "punctuation.definition.string.begin.lilypond"]});
      expect(tokens[11]).toEqual({value: "down", scopes: ["source.lilypond", "meta.expression-block.lilypond", "string.lilypond"]});
      expect(tokens[12]).toEqual({value: '"', scopes: ["source.lilypond", "meta.expression-block.lilypond", "string.lilypond", "punctuation.definition.string.end.lilypond"]});
      expect(tokens[13]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[14]).toEqual({value: "c", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.note-name.lilypond"]});
      expect(tokens[15]).toEqual({value: "2", scopes: ["source.lilypond", "meta.expression-block.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[16]).toEqual({value: "-", scopes: ["source.lilypond", "meta.expression-block.lilypond", "punctuation.hyphen.lilypond"]});
      expect(tokens[17]).toEqual({value: '"', scopes: ["source.lilypond", "meta.expression-block.lilypond", "string.lilypond", "punctuation.definition.string.begin.lilypond"]});
      expect(tokens[18]).toEqual({value: "default", scopes: ["source.lilypond", "meta.expression-block.lilypond", "string.lilypond"]});
      expect(tokens[19]).toEqual({value: '"', scopes: ["source.lilypond", "meta.expression-block.lilypond", "string.lilypond", "punctuation.definition.string.end.lilypond"]});

      tokens = lines[11];
      expect(tokens.length).toBe(14);
      expect(tokens[0]).toEqual({value: "  ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[1]).toEqual({value: "ces", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.note-name.lilypond"]});
      expect(tokens[2]).toEqual({value: "'", scopes: ["source.lilypond", "meta.expression-block.lilypond", "punctuation.apostrophe.lilypond"]});
      expect(tokens[3]).toEqual({value: "!", scopes: ["source.lilypond", "meta.expression-block.lilypond", "punctuation.exclamation-point.lilypond"]});
      expect(tokens[4]).toEqual({value: "4", scopes: ["source.lilypond", "meta.expression-block.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[5]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[6]).toEqual({value: "ces", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.note-name.lilypond"]});
      expect(tokens[7]).toEqual({value: ",", scopes: ["source.lilypond", "meta.expression-block.lilypond", "punctuation.comma.lilypond"]});
      expect(tokens[8]).toEqual({value: "?", scopes: ["source.lilypond", "meta.expression-block.lilypond", "punctuation.question-mark.lilypond"]});
      expect(tokens[9]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      expect(tokens[10]).toEqual({value: "c", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.note-name.lilypond"]});
      expect(tokens[11]).toEqual({value: "=", scopes: ["source.lilypond", "meta.expression-block.lilypond", "keyword.operator.equals-sign.lilypond"]});
      expect(tokens[12]).toEqual({value: "'", scopes: ["source.lilypond", "meta.expression-block.lilypond", "punctuation.apostrophe.lilypond"]});
      expect(tokens[13]).toEqual({value: "2", scopes: ["source.lilypond", "meta.expression-block.lilypond", "constant.numeric.integer.lilypond"]});

      tokens = lines[12];
      expect(tokens.length).toBe(1);
      expect(tokens[0]).toEqual({value: "}", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
    });

    it("tokenizes markup blocks", () => {
      for (const command of ["\\markup", "\\markuplist"]) {
        let {tokens} = grammar.tokenizeLine(`${command} \\bold text`);
        expect(tokens.length).toBe(4);
        expect(tokens[0]).toEqual({value: command, scopes: ["source.lilypond", "keyword.other.lilypond"]});
        expect(tokens[1]).toEqual({value: " ", scopes: ["source.lilypond"]});
        expect(tokens[2]).toEqual({value: "\\bold", scopes: ["source.lilypond", "support.function.markup.lilypond"]});
        expect(tokens[3]).toEqual({value: " text", scopes: ["source.lilypond"]});

        tokens = grammar.tokenizeLine(`${command} \\bold \\italic text`).tokens;
        expect(tokens.length).toBe(6);
        expect(tokens[0]).toEqual({value: command, scopes: ["source.lilypond", "keyword.other.lilypond"]});
        expect(tokens[1]).toEqual({value: " ", scopes: ["source.lilypond"]});
        expect(tokens[2]).toEqual({value: "\\bold", scopes: ["source.lilypond", "support.function.markup.lilypond"]});
        expect(tokens[3]).toEqual({value: " ", scopes: ["source.lilypond"]});
        expect(tokens[4]).toEqual({value: "\\italic", scopes: ["source.lilypond", "support.function.markup.lilypond"]});
        expect(tokens[5]).toEqual({value: " text", scopes: ["source.lilypond"]});

        tokens = grammar.tokenizeLine(`${command} %{%} { \\bold "text" }`).tokens;
        expect(tokens.length).toBe(14);
        expect(tokens[0]).toEqual({value: command, scopes: ["source.lilypond", "keyword.other.lilypond"]});
        expect(tokens[1]).toEqual({value: " ", scopes: ["source.lilypond"]});
        expect(tokens[2]).toEqual({value: "%{", scopes: ["source.lilypond", "comment.block.lilypond", "punctuation.definition.comment.begin.lilypond"]});
        expect(tokens[3]).toEqual({value: "%}", scopes: ["source.lilypond", "comment.block.lilypond", "punctuation.definition.comment.end.lilypond"]});
        expect(tokens[4]).toEqual({value: " ", scopes: ["source.lilypond"]});
        expect(tokens[5]).toEqual({value: "{", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
        expect(tokens[6]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
        expect(tokens[7]).toEqual({value: "\\bold", scopes: ["source.lilypond", "meta.expression-block.lilypond", "support.function.markup.lilypond"]});
        expect(tokens[8]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
        expect(tokens[9]).toEqual({value: '"', scopes: ["source.lilypond", "meta.expression-block.lilypond", "string.lilypond", "punctuation.definition.string.begin.lilypond"]});
        expect(tokens[10]).toEqual({value: "text", scopes: ["source.lilypond", "meta.expression-block.lilypond", "string.lilypond"]});
        expect(tokens[11]).toEqual({value: '"', scopes: ["source.lilypond", "meta.expression-block.lilypond", "string.lilypond", "punctuation.definition.string.end.lilypond"]});
        expect(tokens[12]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
        expect(tokens[13]).toEqual({value: "}", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});

        const lines = grammar.tokenizeLines(dedent`
          ${command} { \\bold { ten. \\italic dolce e semplice
          }}
        `);
        tokens = lines[0];
        expect(tokens.length).toBe(14);
        expect(tokens[0]).toEqual({value: command, scopes: ["source.lilypond", "keyword.other.lilypond"]});
        expect(tokens[1]).toEqual({value: " ", scopes: ["source.lilypond"]});
        expect(tokens[2]).toEqual({value: "{", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
        expect(tokens[3]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
        expect(tokens[4]).toEqual({value: "\\bold", scopes: ["source.lilypond", "meta.expression-block.lilypond", "support.function.markup.lilypond"]});
        expect(tokens[5]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
        expect(tokens[6]).toEqual({value: "{", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.expression-block.lilypond"]});
        expect(tokens[7]).toEqual({value: " ten", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.expression-block.lilypond"]});
        expect(tokens[8]).toEqual({value: ".", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.expression-block.lilypond", "punctuation.dot.lilypond"]});
        expect(tokens[9]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.expression-block.lilypond"]});
        expect(tokens[10]).toEqual({value: "\\italic", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.expression-block.lilypond", "support.function.markup.lilypond"]});
        expect(tokens[11]).toEqual({value: " dolce ", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.expression-block.lilypond"]});
        expect(tokens[12]).toEqual({value: "e", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.expression-block.lilypond", "text.note-name.lilypond"]});
        expect(tokens[13]).toEqual({value: " semplice", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.expression-block.lilypond"]});
        tokens = lines[1];
        expect(tokens.length).toBe(2);
        expect(tokens[0]).toEqual({value: "}", scopes: ["source.lilypond", "meta.expression-block.lilypond", "meta.expression-block.lilypond"]});
        expect(tokens[1]).toEqual({value: "}", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
      }
    });

    it("tokenizes lyric mode", () => {
      for (const command of ["\\addlyrics", "\\lyricmode", "\\lyrics", "\\lyricsto"]) {
        let {tokens} = grammar.tokenizeLine(`${command} %{%} { a -- b_c~d __ _ }`);
        expect(tokens.length).toBe(24);
        expect(tokens[0]).toEqual({value: command, scopes: ["source.lilypond", "keyword.other.lilypond"]});
        expect(tokens[1]).toEqual({value: " ", scopes: ["source.lilypond"]});
        expect(tokens[2]).toEqual({value: "%{", scopes: ["source.lilypond", "comment.block.lilypond", "punctuation.definition.comment.begin.lilypond"]});
        expect(tokens[3]).toEqual({value: "%}", scopes: ["source.lilypond", "comment.block.lilypond", "punctuation.definition.comment.end.lilypond"]});
        expect(tokens[4]).toEqual({value: " ", scopes: ["source.lilypond"]});
        expect(tokens[5]).toEqual({value: "{", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
        expect(tokens[6]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
        expect(tokens[7]).toEqual({value: "a", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.note-name.lilypond"]});
        expect(tokens[8]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
        expect(tokens[9]).toEqual({value: "-", scopes: ["source.lilypond", "meta.expression-block.lilypond", "punctuation.hyphen.lilypond"]});
        expect(tokens[10]).toEqual({value: "-", scopes: ["source.lilypond", "meta.expression-block.lilypond", "punctuation.hyphen.lilypond"]});
        expect(tokens[11]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
        expect(tokens[12]).toEqual({value: "b", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.note-name.lilypond"]});
        expect(tokens[13]).toEqual({value: "_", scopes: ["source.lilypond", "meta.expression-block.lilypond", "punctuation.underscore.lilypond"]});
        expect(tokens[14]).toEqual({value: "c", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
        expect(tokens[15]).toEqual({value: "~", scopes: ["source.lilypond", "meta.expression-block.lilypond", "punctuation.tilde.lilypond"]});
        expect(tokens[16]).toEqual({value: "d", scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.note-name.lilypond"]});
        expect(tokens[17]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
        expect(tokens[18]).toEqual({value: "_", scopes: ["source.lilypond", "meta.expression-block.lilypond", "punctuation.underscore.lilypond"]});
        expect(tokens[19]).toEqual({value: "_", scopes: ["source.lilypond", "meta.expression-block.lilypond", "punctuation.underscore.lilypond"]});
        expect(tokens[20]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
        expect(tokens[21]).toEqual({value: "_", scopes: ["source.lilypond", "meta.expression-block.lilypond", "punctuation.underscore.lilypond"]});
        expect(tokens[22]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
        expect(tokens[23]).toEqual({value: "}", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});

        const lines = grammar.tokenizeLines(dedent`
          ${command} {
          }%{%}
        `);
        tokens = lines[0];
        expect(tokens.length).toBe(3);
        expect(tokens[0]).toEqual({value: command, scopes: ["source.lilypond", "keyword.other.lilypond"]});
        expect(tokens[1]).toEqual({value: " ", scopes: ["source.lilypond"]});
        expect(tokens[2]).toEqual({value: "{", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
        tokens = lines[1];
        expect(tokens.length).toBe(3);
        expect(tokens[0]).toEqual({value: "}", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
        expect(tokens[1]).toEqual({value: "%{", scopes: ["source.lilypond", "comment.block.lilypond", "punctuation.definition.comment.begin.lilypond"]});
        expect(tokens[2]).toEqual({value: "%}", scopes: ["source.lilypond", "comment.block.lilypond", "punctuation.definition.comment.end.lilypond"]});
      }
    });

    it("tokenizes chord mode", () => {
      let {tokens} = grammar.tokenizeLine("\\chordmode %{%} { c:aug c:dim c:m c:maj7 c:sus c:5.7-.9+^5/e c'/+e }");
      expect(tokens.length).toBe(48);
      expect(tokens[0]).toEqual({value: "\\chordmode", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "keyword.other.lilypond"]});
      expect(tokens[1]).toEqual({value: " ", scopes: ["source.lilypond", "meta.chord-mode.lilypond"]});
      expect(tokens[2]).toEqual({value: "%{", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "comment.block.lilypond", "punctuation.definition.comment.begin.lilypond"]});
      expect(tokens[3]).toEqual({value: "%}", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "comment.block.lilypond", "punctuation.definition.comment.end.lilypond"]});
      expect(tokens[4]).toEqual({value: " ", scopes: ["source.lilypond", "meta.chord-mode.lilypond"]});
      expect(tokens[5]).toEqual({value: "{", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond"]});
      expect(tokens[6]).toEqual({value: " ", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond"]});
      expect(tokens[7]).toEqual({value: "c", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[8]).toEqual({value: ":", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond", "keyword.operator.chord.modifier-indicator.lilypond"]});
      expect(tokens[9]).toEqual({value: "aug", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond", "keyword.other.chord.modifier.lilypond"]});
      expect(tokens[10]).toEqual({value: " ", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond"]});
      expect(tokens[11]).toEqual({value: "c", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[12]).toEqual({value: ":", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond", "keyword.operator.chord.modifier-indicator.lilypond"]});
      expect(tokens[13]).toEqual({value: "dim", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond", "keyword.other.chord.modifier.lilypond"]});
      expect(tokens[14]).toEqual({value: " ", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond"]});
      expect(tokens[15]).toEqual({value: "c", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[16]).toEqual({value: ":", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond", "keyword.operator.chord.modifier-indicator.lilypond"]});
      expect(tokens[17]).toEqual({value: "m", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond", "keyword.other.chord.modifier.lilypond"]});
      expect(tokens[18]).toEqual({value: " ", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond"]});
      expect(tokens[19]).toEqual({value: "c", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[20]).toEqual({value: ":", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond", "keyword.operator.chord.modifier-indicator.lilypond"]});
      expect(tokens[21]).toEqual({value: "maj", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond", "keyword.other.chord.modifier.lilypond"]});
      expect(tokens[22]).toEqual({value: "7", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[23]).toEqual({value: " ", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond"]});
      expect(tokens[24]).toEqual({value: "c", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[25]).toEqual({value: ":", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond", "keyword.operator.chord.modifier-indicator.lilypond"]});
      expect(tokens[26]).toEqual({value: "sus", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond", "keyword.other.chord.modifier.lilypond"]});
      expect(tokens[27]).toEqual({value: " ", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond"]});
      expect(tokens[28]).toEqual({value: "c", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[29]).toEqual({value: ":", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond", "keyword.operator.chord.modifier-indicator.lilypond"]});
      expect(tokens[30]).toEqual({value: "5", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[31]).toEqual({value: ".", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond", "keyword.operator.dot.lilypond"]});
      expect(tokens[32]).toEqual({value: "7", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[33]).toEqual({value: "-", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond", "keyword.operator.chord.alter-note.flat.lilypond"]});
      expect(tokens[34]).toEqual({value: ".", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond", "keyword.operator.dot.lilypond"]});
      expect(tokens[35]).toEqual({value: "9", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[36]).toEqual({value: "+", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond", "keyword.operator.chord.alter-note.sharp.lilypond"]});
      expect(tokens[37]).toEqual({value: "^", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond", "keyword.operator.chord.remove-note.lilypond"]});
      expect(tokens[38]).toEqual({value: "5", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[39]).toEqual({value: "/", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond", "keyword.operator.forward-slash.lilypond"]});
      expect(tokens[40]).toEqual({value: "e", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[41]).toEqual({value: " ", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond"]});
      expect(tokens[42]).toEqual({value: "c", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[43]).toEqual({value: "'", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond", "keyword.operator.transpose-octave.up.lilypond"]});
      expect(tokens[44]).toEqual({value: "/+", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond", "keyword.operator.chord.add-bass-note.lilypond"]});
      expect(tokens[45]).toEqual({value: "e", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[46]).toEqual({value: " ", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond"]});
      expect(tokens[47]).toEqual({value: "}", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond"]});

      const lines = grammar.tokenizeLines(dedent`
        \\chordmode {
        }%{%}
      `);
      tokens = lines[0];
      expect(tokens.length).toBe(3);
      expect(tokens[0]).toEqual({value: "\\chordmode", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "keyword.other.lilypond"]});
      expect(tokens[1]).toEqual({value: " ", scopes: ["source.lilypond", "meta.chord-mode.lilypond"]});
      expect(tokens[2]).toEqual({value: "{", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond"]});
      tokens = lines[1];
      expect(tokens.length).toBe(3);
      expect(tokens[0]).toEqual({value: "}", scopes: ["source.lilypond", "meta.chord-mode.lilypond", "meta.chord-expression.lilypond"]});
      expect(tokens[1]).toEqual({value: "%{", scopes: ["source.lilypond", "comment.block.lilypond", "punctuation.definition.comment.begin.lilypond"]});
      expect(tokens[2]).toEqual({value: "%}", scopes: ["source.lilypond", "comment.block.lilypond", "punctuation.definition.comment.end.lilypond"]});
    });

    it("tokenizes keywords", () => {
      // To create the strings in the keywords array, run:
      /*
git clone https://git.savannah.gnu.org/git/lilypond.git
cd lilypond
git checkout tags/v2.24.4
python -c '
import re
keywords = {"maininput", "include", "version"}
with open("lily/lily-lexer.cc") as file:
    for match in re.finditer("^\\s*\\{\"([^\"]+)\",\\s*[^}]*},?\\s*$", file.read(), re.MULTILINE):
        keywords.add(match.group(1))
keywords = list(keywords)
keywords.sort()
for keyword in keywords:
    print("        \"" + keyword + "\",")
'
cd ..
rm -fR lilypond
      */
      const keywordSuffixes = [
        "accepts",
        "addlyrics",
        "alias",
        "alternative",
        "book",
        "bookpart",
        "change",
        "chordmode",
        "chords",
        "consists",
        "context",
        "default",
        "defaultchild",
        "denies",
        "description",
        "drummode",
        "drums",
        "etc",
        "figuremode",
        "figures",
        "header",
        "include",
        "layout",
        "lyricmode",
        "lyrics",
        "lyricsto",
        "maininput",
        "markup",
        "markuplist",
        "midi",
        "name",
        "new",
        "notemode",
        "override",
        "paper",
        "remove",
        "repeat",
        "rest",
        "revert",
        "score",
        "sequential",
        "set",
        "simultaneous",
        "tempo",
        "type",
        "unset",
        "version",
        "with",
      ];
      for (const suffix of keywordSuffixes) {
        const keyword = `\\${suffix}`;
        const {tokens} = grammar.tokenizeLine(keyword);
        expect(tokens.length).toBe(1);
        expect(tokens[0]).toEqual({value: keyword, scopes: ["source.lilypond", "keyword.other.lilypond"]});
      }
    });

    it("tokenizes built-in commands", () => {
      // To create the strings in the commands array, paste the result of:
      /*
git clone https://git.savannah.gnu.org/git/lilypond.git
cd lilypond
git checkout tags/v2.24.4
python -c '
import re
commands = set()
for path in ["ly/declarations-init.ly",
             "ly/music-functions-init.ly",
             "ly/toc-init.ly",
             "ly/drumpitch-init.ly",
             "ly/chord-modifiers-init.ly",
             "ly/script-init.ly",
             "ly/chord-repetition-init.ly",
             "ly/scale-definitions-init.ly",
             "ly/dynamic-scripts-init.ly",
             "ly/spanners-init.ly",
             "ly/predefined-fretboards-init.ly",
             "ly/string-tunings-init.ly",
             "ly/property-init.ly",
             "ly/grace-init.ly",
             "ly/performer-init.ly",
             "ly/paper-defaults-init.ly",
             "ly/context-mods-init.ly"]:
    with open(path) as file:
        contents = file.read()
        for match in re.finditer("^(?:([A-Za-z]+)|\"([A-Za-z]+)\")\\s*=", contents, re.MULTILINE):
            if (match.group(1)):
                commands.add(match.group(1))
            else:
                commands.add(match.group(2))
commands = list(commands)
commands.sort()
for command in commands:
    print("        \"\\\\" + command + "\",")
' | pbcopy
cd ..
rm -fR lilypond
      */
      const commands = [
        "\\EnableGregorianDivisiones",
        "\\RemoveAllEmptyStaves",
        "\\RemoveEmptyStaves",
        "\\absolute",
        "\\accent",
        "\\acciaccatura",
        "\\accidentalStyle",
        "\\addChordShape",
        "\\addInstrumentDefinition",
        "\\addQuote",
        "\\aeolian",
        "\\after",
        "\\afterGrace",
        "\\afterGraceFraction",
        "\\aikenHeads",
        "\\aikenHeadsMinor",
        "\\aikenThinHeads",
        "\\aikenThinHeadsMinor",
        "\\allowBreak",
        "\\allowPageTurn",
        "\\allowVoltaHook",
        "\\alterBroken",
        "\\ambitusAfter",
        "\\appendToTag",
        "\\applyContext",
        "\\applyMusic",
        "\\applyOutput",
        "\\appoggiatura",
        "\\arabicStringNumbers",
        "\\arpeggio",
        "\\arpeggioArrowDown",
        "\\arpeggioArrowUp",
        "\\arpeggioBracket",
        "\\arpeggioNormal",
        "\\arpeggioParenthesis",
        "\\arpeggioParenthesisDashed",
        "\\assertBeamQuant",
        "\\assertBeamSlope",
        "\\autoBeamOff",
        "\\autoBeamOn",
        "\\autoBreaksOff",
        "\\autoBreaksOn",
        "\\autoChange",
        "\\autoLineBreaksOff",
        "\\autoLineBreaksOn",
        "\\autoPageBreaksOff",
        "\\autoPageBreaksOn",
        "\\balloonGrobText",
        "\\balloonLengthOff",
        "\\balloonLengthOn",
        "\\balloonText",
        "\\bar",
        "\\barNumberCheck",
        "\\bassFigureExtendersOff",
        "\\bassFigureExtendersOn",
        "\\bassFigureStaffAlignmentDown",
        "\\bassFigureStaffAlignmentNeutral",
        "\\bassFigureStaffAlignmentUp",
        "\\beamExceptions",
        "\\bendAfter",
        "\\bendHold",
        "\\bendStartLevel",
        "\\bigger",
        "\\blackTriangleMarkup",
        "\\bookOutputName",
        "\\bookOutputSuffix",
        "\\break",
        "\\breakDynamicSpan",
        "\\breathe",
        "\\breve",
        "\\cadenzaOff",
        "\\cadenzaOn",
        "\\caesura",
        "\\center",
        "\\chordRepeats",
        "\\chordmodifiers",
        "\\clef",
        "\\coda",
        "\\codaMark",
        "\\compoundMeter",
        "\\compressEmptyMeasures",
        "\\compressMMRests",
        "\\cr",
        "\\cresc",
        "\\crescHairpin",
        "\\crescTextCresc",
        "\\crossStaff",
        "\\cueClef",
        "\\cueClefUnset",
        "\\cueDuring",
        "\\cueDuringWithClef",
        "\\dashBang",
        "\\dashDash",
        "\\dashDot",
        "\\dashHat",
        "\\dashLarger",
        "\\dashPlus",
        "\\dashUnderscore",
        "\\deadNote",
        "\\deadNotesOff",
        "\\deadNotesOn",
        "\\decr",
        "\\decresc",
        "\\defaultNoteHeads",
        "\\defaultStringTunings",
        "\\defaultTimeSignature",
        "\\defineBarLine",
        "\\deprecatedcresc",
        "\\deprecateddim",
        "\\deprecatedendcresc",
        "\\deprecatedenddim",
        "\\dim",
        "\\dimHairpin",
        "\\dimTextDecr",
        "\\dimTextDecresc",
        "\\dimTextDim",
        "\\displayLilyMusic",
        "\\displayMusic",
        "\\displayScheme",
        "\\dorian",
        "\\dotsDown",
        "\\dotsNeutral",
        "\\dotsUp",
        "\\down",
        "\\downbow",
        "\\downmordent",
        "\\downprall",
        "\\dropNote",
        "\\drumPitchNames",
        "\\dynamicDown",
        "\\dynamicNeutral",
        "\\dynamicUp",
        "\\easyHeadsOff",
        "\\easyHeadsOn",
        "\\enablePolymeter",
        "\\endSkipNCs",
        "\\endSpanners",
        "\\endcr",
        "\\endcresc",
        "\\enddecr",
        "\\enddecresc",
        "\\enddim",
        "\\episemFinis",
        "\\episemInitium",
        "\\espressivo",
        "\\eventChords",
        "\\expandEmptyMeasures",
        "\\f",
        "\\featherDurations",
        "\\fermata",
        "\\ff",
        "\\fff",
        "\\ffff",
        "\\fffff",
        "\\fine",
        "\\finger",
        "\\fixed",
        "\\flageolet",
        "\\footnote",
        "\\fp",
        "\\frenchChords",
        "\\funkHeads",
        "\\funkHeadsMinor",
        "\\fz",
        "\\germanChords",
        "\\glide",
        "\\glissando",
        "\\grace",
        "\\grobdescriptions",
        "\\halfopen",
        "\\harmonic",
        "\\harmonicByFret",
        "\\harmonicByRatio",
        "\\harmonicNote",
        "\\harmonicsOff",
        "\\harmonicsOn",
        "\\haydnturn",
        "\\henzelongfermata",
        "\\henzeshortfermata",
        "\\hide",
        "\\hideNotes",
        "\\hideSplitTiedTabNotes",
        "\\hideStaffSwitch",
        "\\huge",
        "\\ignatzekExceptionMusic",
        "\\ignatzekExceptions",
        "\\improvisationOff",
        "\\improvisationOn",
        "\\inStaffSegno",
        "\\incipit",
        "\\instrumentSwitch",
        "\\inversion",
        "\\invertChords",
        "\\ionian",
        "\\italianChords",
        "\\jump",
        "\\keepWithTag",
        "\\key",
        "\\kievanOff",
        "\\kievanOn",
        "\\killCues",
        "\\label",
        "\\laissezVibrer",
        "\\language",
        "\\languageRestore",
        "\\languageSaveAndChange",
        "\\large",
        "\\left",
        "\\lheel",
        "\\lineprall",
        "\\locrian",
        "\\longa",
        "\\longfermata",
        "\\ltoe",
        "\\lydian",
        "\\magnifyMusic",
        "\\magnifyStaff",
        "\\major",
        "\\makeClusters",
        "\\makeDefaultStringTuning",
        "\\marcato",
        "\\mark",
        "\\markLengthOff",
        "\\markLengthOn",
        "\\markupMap",
        "\\maxima",
        "\\medianChordGridStyle",
        "\\melisma",
        "\\melismaEnd",
        "\\mergeDifferentlyDottedOff",
        "\\mergeDifferentlyDottedOn",
        "\\mergeDifferentlyHeadedOff",
        "\\mergeDifferentlyHeadedOn",
        "\\mf",
        "\\midiDrumPitches",
        "\\minor",
        "\\mixolydian",
        "\\modalInversion",
        "\\modalTranspose",
        "\\mordent",
        "\\mp",
        "\\musicMap",
        "\\n",
        "\\newSpacingSection",
        "\\noBeam",
        "\\noBreak",
        "\\noPageBreak",
        "\\noPageTurn",
        "\\normalsize",
        "\\numericTimeSignature",
        "\\octaveCheck",
        "\\offset",
        "\\omit",
        "\\once",
        "\\oneVoice",
        "\\open",
        "\\ottava",
        "\\overrideProperty",
        "\\overrideTimeSignatureSettings",
        "\\p",
        "\\pageBreak",
        "\\pageTurn",
        "\\palmMute",
        "\\palmMuteOff",
        "\\palmMuteOn",
        "\\parallelMusic",
        "\\parenthesize",
        "\\partCombine",
        "\\partCombineApart",
        "\\partCombineAutomatic",
        "\\partCombineChords",
        "\\partCombineDown",
        "\\partCombineForce",
        "\\partCombineListener",
        "\\partCombineSoloI",
        "\\partCombineSoloII",
        "\\partCombineUnisono",
        "\\partCombineUp",
        "\\partial",
        "\\phrasingSlurDashPattern",
        "\\phrasingSlurDashed",
        "\\phrasingSlurDotted",
        "\\phrasingSlurDown",
        "\\phrasingSlurHalfDashed",
        "\\phrasingSlurHalfSolid",
        "\\phrasingSlurNeutral",
        "\\phrasingSlurSolid",
        "\\phrasingSlurUp",
        "\\phrygian",
        "\\pitchedTrill",
        "\\pointAndClickOff",
        "\\pointAndClickOn",
        "\\pointAndClickTypes",
        "\\portato",
        "\\pp",
        "\\ppp",
        "\\pppp",
        "\\ppppp",
        "\\prall",
        "\\pralldown",
        "\\prallmordent",
        "\\prallprall",
        "\\prallup",
        "\\preBend",
        "\\preBendHold",
        "\\predefinedFretboardsOff",
        "\\predefinedFretboardsOn",
        "\\propertyOverride",
        "\\propertyRevert",
        "\\propertySet",
        "\\propertyTweak",
        "\\propertyUnset",
        "\\pushToTag",
        "\\quoteDuring",
        "\\raiseNote",
        "\\reduceChords",
        "\\relative",
        "\\removeWithTag",
        "\\repeatTie",
        "\\resetRelativeOctave",
        "\\retrograde",
        "\\reverseturn",
        "\\revertTimeSignatureSettings",
        "\\rfz",
        "\\rheel",
        "\\right",
        "\\rightHandFinger",
        "\\romanStringNumbers",
        "\\rtoe",
        "\\sacredHarpHeads",
        "\\sacredHarpHeadsMinor",
        "\\scaleDurations",
        "\\section",
        "\\sectionLabel",
        "\\segno",
        "\\segnoMark",
        "\\semiGermanChords",
        "\\setDefaultDurationToQuarter",
        "\\settingsFrom",
        "\\sf",
        "\\sff",
        "\\sfp",
        "\\sfz",
        "\\shape",
        "\\shiftDurations",
        "\\shiftOff",
        "\\shiftOn",
        "\\shiftOnn",
        "\\shiftOnnn",
        "\\shortfermata",
        "\\showSplitTiedTabNotes",
        "\\showStaffSwitch",
        "\\signumcongruentiae",
        "\\single",
        "\\skip",
        "\\skipNC",
        "\\skipNCs",
        "\\slashedGrace",
        "\\slashturn",
        "\\slurDashPattern",
        "\\slurDashed",
        "\\slurDotted",
        "\\slurDown",
        "\\slurHalfDashed",
        "\\slurHalfSolid",
        "\\slurNeutral",
        "\\slurSolid",
        "\\slurUp",
        "\\small",
        "\\smaller",
        "\\snappizzicato",
        "\\sostenutoOff",
        "\\sostenutoOn",
        "\\southernHarmonyHeads",
        "\\southernHarmonyHeadsMinor",
        "\\sp",
        "\\spp",
        "\\staccatissimo",
        "\\staccato",
        "\\staffHighlight",
        "\\start",
        "\\startAcciaccaturaMusic",
        "\\startAppoggiaturaMusic",
        "\\startGraceMusic",
        "\\startGraceSlur",
        "\\startGroup",
        "\\startMeasureCount",
        "\\startMeasureSpanner",
        "\\startSlashedGraceMusic",
        "\\startStaff",
        "\\startTextSpan",
        "\\startTrillSpan",
        "\\stemDown",
        "\\stemNeutral",
        "\\stemUp",
        "\\stop",
        "\\stopAcciaccaturaMusic",
        "\\stopAppoggiaturaMusic",
        "\\stopGraceMusic",
        "\\stopGraceSlur",
        "\\stopGroup",
        "\\stopMeasureCount",
        "\\stopMeasureSpanner",
        "\\stopSlashedGraceMusic",
        "\\stopStaff",
        "\\stopStaffHighlight",
        "\\stopTextSpan",
        "\\stopTrillSpan",
        "\\stopped",
        "\\storePredefinedDiagram",
        "\\stringTuning",
        "\\styledNoteHeads",
        "\\sustainOff",
        "\\sustainOn",
        "\\tabChordRepeats",
        "\\tabChordRepetition",
        "\\tabFullNotation",
        "\\tag",
        "\\tagGroup",
        "\\teeny",
        "\\temporary",
        "\\tenuto",
        "\\textEndMark",
        "\\textLengthOff",
        "\\textLengthOn",
        "\\textMark",
        "\\textSpannerDown",
        "\\textSpannerNeutral",
        "\\textSpannerUp",
        "\\thumb",
        "\\tieDashPattern",
        "\\tieDashed",
        "\\tieDotted",
        "\\tieDown",
        "\\tieHalfDashed",
        "\\tieHalfSolid",
        "\\tieNeutral",
        "\\tieSolid",
        "\\tieUp",
        "\\time",
        "\\times",
        "\\tiny",
        "\\tocItem",
        "\\tocItemWithDotsMarkup",
        "\\transpose",
        "\\transposedCueDuring",
        "\\transposition",
        "\\treCorde",
        "\\trill",
        "\\tuplet",
        "\\tupletDown",
        "\\tupletNeutral",
        "\\tupletSpan",
        "\\tupletUp",
        "\\turn",
        "\\tweak",
        "\\unHideNotes",
        "\\unaCorda",
        "\\undo",
        "\\unfoldRepeats",
        "\\unfolded",
        "\\up",
        "\\upbow",
        "\\upmordent",
        "\\upprall",
        "\\varcoda",
        "\\verylongfermata",
        "\\veryshortfermata",
        "\\voiceFour",
        "\\voiceFourStyle",
        "\\voiceNeutralStyle",
        "\\voiceOne",
        "\\voiceOneStyle",
        "\\voiceThree",
        "\\voiceThreeStyle",
        "\\voiceTwo",
        "\\voiceTwoStyle",
        "\\voices",
        "\\void",
        "\\volta",
        "\\vowelTransition",
        "\\vshape",
        "\\walkerHeads",
        "\\walkerHeadsMinor",
        "\\whiteCircleMarkup",
        "\\whiteTriangleMarkup",
        "\\withMusicProperty",
        "\\xNote",
        "\\xNotesOff",
        "\\xNotesOn",
      ];
      for (const command of commands) {
        const {tokens} = grammar.tokenizeLine(command);
        expect(tokens.length).toBe(1);
        expect(tokens[0]).toEqual({value: command, scopes: ["source.lilypond", "support.function.lilypond"]});
      }
    });

    it("tokenizes built-in markup commands", () => {
      // To create the strings in the commands array, paste the result of:
      /*
git clone https://git.savannah.gnu.org/git/lilypond.git
cd lilypond
git checkout tags/v2.24.4
python -c '
import re
commands = set()
for path in ["ly/toc-init.ly",
             "scm/define-markup-commands.scm",
             "scm/fret-diagrams.scm",
             "scm/harp-pedals.scm"]:
    with open(path) as file:
        for match in re.finditer(r"\(define-markup(?:-list)?-command\s*\(([-A-Za-z]+)", file.read(), re.MULTILINE):
            commands.add(match.group(1))
commands.remove("command-name")
commands = list(commands)
commands.sort()
for command in commands:
    print("        \"\\\\" + command + "\",")
' | pbcopy
cd ..
rm -fR lilypond
      */
      const commands = [
        "\\abs-fontsize",
        "\\arrow-head",
        "\\auto-footnote",
        "\\backslashed-digit",
        "\\beam",
        "\\bold",
        "\\box",
        "\\bracket",
        "\\caps",
        "\\center-align",
        "\\center-column",
        "\\char",
        "\\circle",
        "\\column",
        "\\column-lines",
        "\\combine",
        "\\concat",
        "\\dir-column",
        "\\doubleflat",
        "\\doublesharp",
        "\\draw-circle",
        "\\draw-dashed-line",
        "\\draw-dotted-line",
        "\\draw-hline",
        "\\draw-line",
        "\\draw-squiggle-line",
        "\\dynamic",
        "\\ellipse",
        "\\epsfile",
        "\\eyeglasses",
        "\\fermata",
        "\\fill-line",
        "\\fill-with-pattern",
        "\\filled-box",
        "\\finger",
        "\\first-visible",
        "\\flat",
        "\\fontCaps",
        "\\fontsize",
        "\\footnote",
        "\\fraction",
        "\\fret-diagram",
        "\\fret-diagram-terse",
        "\\fret-diagram-verbose",
        "\\fromproperty",
        "\\general-align",
        "\\halign",
        "\\harp-pedal",
        "\\hbracket",
        "\\hcenter-in",
        "\\hspace",
        "\\huge",
        "\\italic",
        "\\justified-lines",
        "\\justify",
        "\\justify-field",
        "\\justify-line",
        "\\justify-string",
        "\\large",
        "\\larger",
        "\\left-align",
        "\\left-brace",
        "\\left-column",
        "\\line",
        "\\lookup",
        "\\lower",
        "\\magnify",
        "\\map-markup-commands",
        "\\markalphabet",
        "\\markletter",
        "\\medium",
        "\\musicglyph",
        "\\natural",
        "\\normal-size-sub",
        "\\normal-size-super",
        "\\normal-text",
        "\\normalsize",
        "\\note",
        "\\note-by-number",
        "\\null",
        "\\number",
        "\\on-the-fly",
        "\\oval",
        "\\overlay",
        "\\override",
        "\\override-lines",
        "\\overtie",
        "\\pad-around",
        "\\pad-markup",
        "\\pad-to-box",
        "\\pad-x",
        "\\page-link",
        "\\page-ref",
        "\\parenthesize",
        "\\path",
        "\\pattern",
        "\\postscript",
        "\\property-recursive",
        "\\put-adjacent",
        "\\raise",
        "\\replace",
        "\\rest",
        "\\rest-by-number",
        "\\right-align",
        "\\right-brace",
        "\\right-column",
        "\\roman",
        "\\rotate",
        "\\rounded-box",
        "\\sans",
        "\\scale",
        "\\score",
        "\\score-lines",
        "\\semiflat",
        "\\semisharp",
        "\\sesquiflat",
        "\\sesquisharp",
        "\\sharp",
        "\\simple",
        "\\slashed-digit",
        "\\small",
        "\\smallCaps",
        "\\smaller",
        "\\stencil",
        "\\strut",
        "\\sub",
        "\\super",
        "\\table",
        "\\table-of-contents",
        "\\teeny",
        "\\text",
        "\\tie",
        "\\tied-lyric",
        "\\tiny",
        "\\translate",
        "\\translate-scaled",
        "\\transparent",
        "\\triangle",
        "\\typewriter",
        "\\underline",
        "\\undertie",
        "\\upright",
        "\\vcenter",
        "\\verbatim-file",
        "\\vspace",
        "\\whiteout",
        "\\with-color",
        "\\with-dimensions",
        "\\with-dimensions-from",
        "\\with-link",
        "\\with-outline",
        "\\with-url",
        "\\wordwrap",
        "\\wordwrap-field",
        "\\wordwrap-internal",
        "\\wordwrap-lines",
        "\\wordwrap-string",
        "\\wordwrap-string-internal",
      ];
      for (const command of commands) {
        const {tokens} = grammar.tokenizeLine(`\\markup ${command}`);
        expect(tokens.length).toBe(3);
        expect(tokens[0]).toEqual({value: "\\markup", scopes: ["source.lilypond", "keyword.other.lilypond"]});
        expect(tokens[1]).toEqual({value: " ", scopes: ["source.lilypond"]});
        const scopes = ["source.lilypond"];
        switch (command) {
          case "\\fermata":
          case "\\finger":
          case "\\footnote":
          case "\\huge":
          case "\\large":
          case "\\normalsize":
          case "\\parenthesize":
          case "\\small":
          case "\\smaller":
          case "\\teeny":
          case "\\tiny":
            scopes.push("support.function.lilypond");
            break;
          case "\\override":
          case "\\rest":
          case "\\score":
            scopes.push("keyword.other.lilypond");
            break;
          default:
            scopes.push("support.function.markup.lilypond");
        }
        expect(tokens[2]).toEqual({value: command, scopes: scopes});
      }
    });

    it("tokenizes percussion note names", () => {
      // To create the strings in the percussionNoteNames array, run:
      /*
lilypond --loglevel=ERROR - <<EOS
#(begin
  (for-each
    (lambda (drumPitchName) (display "        \"")(display (car drumPitchName))(display "\",")(newline))
    drumPitchNames))
EOS
      */
      const percussionNoteNames = [
        "acousticbassdrum",
        "bassdrum",
        "hisidestick",
        "sidestick",
        "losidestick",
        "acousticsnare",
        "snare",
        "handclap",
        "electricsnare",
        "lowfloortom",
        "closedhihat",
        "hihat",
        "highfloortom",
        "pedalhihat",
        "lowtom",
        "openhihat",
        "halfopenhihat",
        "lowmidtom",
        "himidtom",
        "crashcymbala",
        "crashcymbal",
        "hightom",
        "ridecymbala",
        "ridecymbal",
        "chinesecymbal",
        "ridebell",
        "tambourine",
        "splashcymbal",
        "cowbell",
        "crashcymbalb",
        "vibraslap",
        "ridecymbalb",
        "mutehibongo",
        "hibongo",
        "openhibongo",
        "mutelobongo",
        "lobongo",
        "openlobongo",
        "mutehiconga",
        "muteloconga",
        "openhiconga",
        "hiconga",
        "openloconga",
        "loconga",
        "hitimbale",
        "lotimbale",
        "hiagogo",
        "loagogo",
        "cabasa",
        "maracas",
        "shortwhistle",
        "longwhistle",
        "shortguiro",
        "longguiro",
        "guiro",
        "claves",
        "hiwoodblock",
        "lowoodblock",
        "mutecuica",
        "opencuica",
        "mutetriangle",
        "triangle",
        "opentriangle",
        "bda",
        "bd",
        "ssh",
        "ss",
        "ssl",
        "sna",
        "sn",
        "hc",
        "sne",
        "tomfl",
        "hhc",
        "hh",
        "tomfh",
        "hhp",
        "toml",
        "hho",
        "hhho",
        "tomml",
        "tommh",
        "cymca",
        "cymc",
        "tomh",
        "cymra",
        "cymr",
        "cymch",
        "rb",
        "tamb",
        "cyms",
        "cb",
        "cymcb",
        "vibs",
        "cymrb",
        "bohm",
        "boh",
        "boho",
        "bolm",
        "bol",
        "bolo",
        "cghm",
        "cglm",
        "cgho",
        "cgh",
        "cglo",
        "cgl",
        "timh",
        "timl",
        "agh",
        "agl",
        "cab",
        "mar",
        "whs",
        "whl",
        "guis",
        "guil",
        "gui",
        "cl",
        "wbh",
        "wbl",
        "cuim",
        "cuio",
        "trim",
        "tri",
        "trio",
        "tt",
      ];

      for (const command of ["\\drummode", "\\drums"]) {
        for (const percussionNoteName of percussionNoteNames) {
          const {tokens} = grammar.tokenizeLine(`${command} { ${percussionNoteName} }`);
          expect(tokens.length).toBe(7);
          expect(tokens[0]).toEqual({value: command, scopes: ["source.lilypond", "keyword.other.lilypond"]});
          expect(tokens[1]).toEqual({value: " ", scopes: ["source.lilypond"]});
          expect(tokens[2]).toEqual({value: "{", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
          expect(tokens[3]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
          expect(tokens[4]).toEqual({value: percussionNoteName, scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.percussion-note.lilypond"]});
          expect(tokens[5]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
          expect(tokens[6]).toEqual({value: "}", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
        }
      }
    });

    it("tokenizes note names", () => {
      // To create the noteNamesByLanguage object, run:
      /*
lilypond --loglevel=ERROR - <<EOS
#(begin
  (display "      const noteNamesByLanguage = {")(newline)
  (for-each
    (lambda (language)
      (display "        ")(display language)(display ": [")(newline)
      (for-each
        (lambda (pitchName) (display "          \"")(display (car pitchName))(display "\",")(newline))
        (ly:assoc-get language language-pitch-names))
      (display "        ],")(newline))
    '(nederlands catalan deutsch english español français italiano norsk portugues suomi svenska vlaams))
  (display "      };")(newline)
)
EOS
      */
      const noteNamesByLanguage = {
        nederlands: [
          "ceses",
          "ceseh",
          "ces",
          "ceh",
          "c",
          "cih",
          "cis",
          "cisih",
          "cisis",
          "deses",
          "deseh",
          "des",
          "deh",
          "d",
          "dih",
          "dis",
          "disih",
          "disis",
          "eeses",
          "eses",
          "eeseh",
          "ees",
          "es",
          "eeh",
          "e",
          "eih",
          "eis",
          "eisih",
          "eisis",
          "feses",
          "feseh",
          "fes",
          "feh",
          "f",
          "fih",
          "fis",
          "fisih",
          "fisis",
          "geses",
          "geseh",
          "ges",
          "geh",
          "g",
          "gih",
          "gis",
          "gisih",
          "gisis",
          "aeses",
          "ases",
          "aeseh",
          "aes",
          "as",
          "aeh",
          "a",
          "aih",
          "ais",
          "aisih",
          "aisis",
          "beses",
          "beseh",
          "bes",
          "beh",
          "b",
          "bih",
          "bis",
          "bisih",
          "bisis",
        ],
        catalan: [
          "dobb",
          "dotqb",
          "dob",
          "doqb",
          "do",
          "doqd",
          "dod",
          "dotqd",
          "dodd",
          "rebb",
          "retqb",
          "reb",
          "reqb",
          "re",
          "reqd",
          "red",
          "retqd",
          "redd",
          "mibb",
          "mitqb",
          "mib",
          "miqb",
          "mi",
          "miqd",
          "mid",
          "mitqd",
          "midd",
          "fabb",
          "fatqb",
          "fab",
          "faqb",
          "fa",
          "faqd",
          "fad",
          "fatqd",
          "fadd",
          "solbb",
          "soltqb",
          "solb",
          "solqb",
          "sol",
          "solqd",
          "sold",
          "soltqd",
          "soldd",
          "labb",
          "latqb",
          "lab",
          "laqb",
          "la",
          "laqd",
          "lad",
          "latqd",
          "ladd",
          "sibb",
          "sitqb",
          "sib",
          "siqb",
          "si",
          "siqd",
          "sid",
          "sitqd",
          "sidd",
          "doqs",
          "dos",
          "dotqs",
          "doss",
          "reqs",
          "res",
          "retqs",
          "ress",
          "miqs",
          "mis",
          "mitqs",
          "miss",
          "faqs",
          "fas",
          "fatqs",
          "fass",
          "solqs",
          "sols",
          "soltqs",
          "solss",
          "laqs",
          "las",
          "latqs",
          "lass",
          "siqs",
          "sis",
          "sitqs",
          "siss",
        ],
        deutsch: [
          "ceses",
          "ceseh",
          "ces",
          "ceh",
          "c",
          "cih",
          "cis",
          "cisih",
          "cisis",
          "deses",
          "deseh",
          "des",
          "deh",
          "d",
          "dih",
          "dis",
          "disih",
          "disis",
          "eses",
          "eseh",
          "es",
          "eeh",
          "eh",
          "e",
          "eih",
          "eis",
          "eisih",
          "eisis",
          "feses",
          "feseh",
          "fes",
          "feh",
          "f",
          "fih",
          "fis",
          "fisih",
          "fisis",
          "geses",
          "geseh",
          "ges",
          "geh",
          "g",
          "gih",
          "gis",
          "gisih",
          "gisis",
          "asas",
          "ases",
          "asah",
          "aseh",
          "as",
          "aeh",
          "ah",
          "a",
          "aih",
          "ais",
          "aisih",
          "aisis",
          "heses",
          "heseh",
          "b",
          "heh",
          "h",
          "hih",
          "his",
          "hisih",
          "hisis",
        ],
        english: [
          "cff",
          "ctqf",
          "cf",
          "cqf",
          "c",
          "cqs",
          "cs",
          "ctqs",
          "css",
          "cx",
          "dff",
          "dtqf",
          "df",
          "dqf",
          "d",
          "dqs",
          "ds",
          "dtqs",
          "dss",
          "dx",
          "eff",
          "etqf",
          "ef",
          "eqf",
          "e",
          "eqs",
          "es",
          "etqs",
          "ess",
          "ex",
          "fff",
          "ftqf",
          "ff",
          "fqf",
          "f",
          "fqs",
          "fs",
          "ftqs",
          "fss",
          "fx",
          "gff",
          "gtqf",
          "gf",
          "gqf",
          "g",
          "gqs",
          "gs",
          "gtqs",
          "gss",
          "gx",
          "aff",
          "atqf",
          "af",
          "aqf",
          "a",
          "aqs",
          "as",
          "atqs",
          "ass",
          "ax",
          "bff",
          "btqf",
          "bf",
          "bqf",
          "b",
          "bqs",
          "bs",
          "btqs",
          "bss",
          "bx",
          "c-flatflat",
          "c-flat",
          "c-natural",
          "c-sharp",
          "c-sharpsharp",
          "d-flatflat",
          "d-flat",
          "d-natural",
          "d-sharp",
          "d-sharpsharp",
          "e-flatflat",
          "e-flat",
          "e-natural",
          "e-sharp",
          "e-sharpsharp",
          "f-flatflat",
          "f-flat",
          "f-natural",
          "f-sharp",
          "f-sharpsharp",
          "g-flatflat",
          "g-flat",
          "g-natural",
          "g-sharp",
          "g-sharpsharp",
          "a-flatflat",
          "a-flat",
          "a-natural",
          "a-sharp",
          "a-sharpsharp",
          "b-flatflat",
          "b-flat",
          "b-natural",
          "b-sharp",
          "b-sharpsharp",
        ],
        español: [
          "dobb",
          "dotcb",
          "dob",
          "docb",
          "do",
          "docs",
          "dos",
          "dotcs",
          "doss",
          "dox",
          "rebb",
          "retcb",
          "reb",
          "recb",
          "re",
          "recs",
          "res",
          "retcs",
          "ress",
          "rex",
          "mibb",
          "mitcb",
          "mib",
          "micb",
          "mi",
          "mics",
          "mis",
          "mitcs",
          "miss",
          "mix",
          "fabb",
          "fatcb",
          "fab",
          "facb",
          "fa",
          "facs",
          "fas",
          "fatcs",
          "fass",
          "fax",
          "solbb",
          "soltcb",
          "solb",
          "solcb",
          "sol",
          "solcs",
          "sols",
          "soltcs",
          "solss",
          "solx",
          "labb",
          "latcb",
          "lab",
          "lacb",
          "la",
          "lacs",
          "las",
          "latcs",
          "lass",
          "lax",
          "sibb",
          "sitcb",
          "sib",
          "sicb",
          "si",
          "sics",
          "sis",
          "sitcs",
          "siss",
          "six",
        ],
        français: [
          "dobb",
          "dobsb",
          "dob",
          "dosb",
          "do",
          "dosd",
          "dod",
          "dodsd",
          "dodd",
          "dox",
          "rébb",
          "rébsb",
          "réb",
          "résb",
          "ré",
          "résd",
          "réd",
          "rédsd",
          "rédd",
          "réx",
          "rebb",
          "rebsb",
          "reb",
          "resb",
          "re",
          "resd",
          "red",
          "redsd",
          "redd",
          "rex",
          "mibb",
          "mibsb",
          "mib",
          "misb",
          "mi",
          "misd",
          "mid",
          "midsd",
          "midd",
          "mix",
          "fabb",
          "fabsb",
          "fab",
          "fasb",
          "fa",
          "fasd",
          "fad",
          "fadsd",
          "fadd",
          "fax",
          "solbb",
          "solbsb",
          "solb",
          "solsb",
          "sol",
          "solsd",
          "sold",
          "soldsd",
          "soldd",
          "solx",
          "labb",
          "labsb",
          "lab",
          "lasb",
          "la",
          "lasd",
          "lad",
          "ladsd",
          "ladd",
          "lax",
          "sibb",
          "sibsb",
          "sib",
          "sisb",
          "si",
          "sisd",
          "sid",
          "sidsd",
          "sidd",
          "six",
        ],
        italiano: [
          "dobb",
          "dobsb",
          "dob",
          "dosb",
          "do",
          "dosd",
          "dod",
          "dodsd",
          "dodd",
          "rebb",
          "rebsb",
          "reb",
          "resb",
          "re",
          "resd",
          "red",
          "redsd",
          "redd",
          "mibb",
          "mibsb",
          "mib",
          "misb",
          "mi",
          "misd",
          "mid",
          "midsd",
          "midd",
          "fabb",
          "fabsb",
          "fab",
          "fasb",
          "fa",
          "fasd",
          "fad",
          "fadsd",
          "fadd",
          "solbb",
          "solbsb",
          "solb",
          "solsb",
          "sol",
          "solsd",
          "sold",
          "soldsd",
          "soldd",
          "labb",
          "labsb",
          "lab",
          "lasb",
          "la",
          "lasd",
          "lad",
          "ladsd",
          "ladd",
          "sibb",
          "sibsb",
          "sib",
          "sisb",
          "si",
          "sisd",
          "sid",
          "sidsd",
          "sidd",
        ],
        norsk: [
          "cessess",
          "ceses",
          "cesseh",
          "ceseh",
          "cess",
          "ces",
          "ceh",
          "c",
          "cih",
          "ciss",
          "cis",
          "cissih",
          "cisih",
          "cississ",
          "cisis",
          "dessess",
          "deses",
          "desseh",
          "deseh",
          "dess",
          "des",
          "deh",
          "d",
          "dih",
          "diss",
          "dis",
          "dissih",
          "disih",
          "dississ",
          "disis",
          "eessess",
          "eeses",
          "essess",
          "eses",
          "eesseh",
          "eeseh",
          "eess",
          "ees",
          "ess",
          "es",
          "eeh",
          "e",
          "eih",
          "eiss",
          "eis",
          "eissih",
          "eisih",
          "eississ",
          "eisis",
          "fessess",
          "feses",
          "fesseh",
          "feseh",
          "fess",
          "fes",
          "feh",
          "f",
          "fih",
          "fiss",
          "fis",
          "fissih",
          "fisih",
          "fississ",
          "fisis",
          "gessess",
          "geses",
          "geseh",
          "gesseh",
          "gess",
          "ges",
          "geh",
          "g",
          "gih",
          "giss",
          "gis",
          "gissih",
          "gisih",
          "gississ",
          "gisis",
          "assess",
          "ases",
          "aessess",
          "aeses",
          "aesseh",
          "aeseh",
          "ass",
          "as",
          "aess",
          "aes",
          "aeh",
          "a",
          "aih",
          "aiss",
          "ais",
          "aissih",
          "aisih",
          "aississ",
          "aisis",
          "bess",
          "bes",
          "beh",
          "b",
          "heh",
          "h",
          "hih",
          "hiss",
          "his",
          "hissih",
          "hisih",
          "hississ",
          "hisis",
        ],
        portugues: [
          "dobb",
          "dobtqt",
          "dob",
          "dobqt",
          "do",
          "dosqt",
          "dos",
          "dostqt",
          "doss",
          "rebb",
          "rebtqt",
          "reb",
          "rebqt",
          "re",
          "resqt",
          "res",
          "restqt",
          "ress",
          "mibb",
          "mibtqt",
          "mib",
          "mibqt",
          "mi",
          "misqt",
          "mis",
          "mistqt",
          "miss",
          "fabb",
          "fabtqt",
          "fab",
          "fabqt",
          "fa",
          "fasqt",
          "fas",
          "fastqt",
          "fass",
          "solbb",
          "solbtqt",
          "solb",
          "solbqt",
          "sol",
          "solsqt",
          "sols",
          "solstqt",
          "solss",
          "labb",
          "labtqt",
          "lab",
          "labqt",
          "la",
          "lasqt",
          "las",
          "lastqt",
          "lass",
          "sibb",
          "sibtqt",
          "sib",
          "sibqt",
          "si",
          "sisqt",
          "sis",
          "sistqt",
          "siss",
        ],
        suomi: [
          "ceses",
          "ceseh",
          "ces",
          "ceh",
          "c",
          "cih",
          "cis",
          "cisih",
          "cisis",
          "deses",
          "deseh",
          "des",
          "deh",
          "d",
          "dih",
          "dis",
          "disih",
          "disis",
          "eses",
          "eseh",
          "es",
          "eeh",
          "e",
          "eih",
          "eis",
          "eisih",
          "eisis",
          "feses",
          "feseh",
          "fes",
          "feh",
          "f",
          "fih",
          "fis",
          "fisih",
          "fisis",
          "geses",
          "geseh",
          "ges",
          "geh",
          "g",
          "gih",
          "gis",
          "gisih",
          "gisis",
          "asas",
          "ases",
          "asah",
          "aseh",
          "as",
          "aeh",
          "a",
          "aih",
          "ais",
          "aisih",
          "aisis",
          "heses",
          "bb",
          "bes",
          "heseh",
          "b",
          "heh",
          "h",
          "hih",
          "his",
          "hisih",
          "hisis",
        ],
        svenska: [
          "cessess",
          "cesseh",
          "cess",
          "ceh",
          "c",
          "cih",
          "ciss",
          "cissih",
          "cississ",
          "dessess",
          "desseh",
          "dess",
          "deh",
          "d",
          "dih",
          "diss",
          "dissih",
          "dississ",
          "essess",
          "esseh",
          "ess",
          "eeh",
          "e",
          "eih",
          "eiss",
          "eissih",
          "eississ",
          "fessess",
          "fesseh",
          "fess",
          "feh",
          "f",
          "fih",
          "fiss",
          "fissih",
          "fississ",
          "gessess",
          "gesseh",
          "gess",
          "geh",
          "g",
          "gih",
          "giss",
          "gissih",
          "gississ",
          "assess",
          "asseh",
          "ass",
          "aeh",
          "a",
          "aih",
          "aiss",
          "aissih",
          "aississ",
          "hessess",
          "hesseh",
          "b",
          "heh",
          "h",
          "hih",
          "hiss",
          "hissih",
          "hississ",
        ],
        vlaams: [
          "dobb",
          "dobhb",
          "dob",
          "dohb",
          "do",
          "dohk",
          "dok",
          "dokhk",
          "dokk",
          "rebb",
          "rebhb",
          "reb",
          "rehb",
          "re",
          "rehk",
          "rek",
          "rekhk",
          "rekk",
          "mibb",
          "mibhb",
          "mib",
          "mihb",
          "mi",
          "mihk",
          "mik",
          "mikhk",
          "mikk",
          "fabb",
          "fabhb",
          "fab",
          "fahb",
          "fa",
          "fahk",
          "fak",
          "fakhk",
          "fakk",
          "solbb",
          "solbhb",
          "solb",
          "solhb",
          "sol",
          "solhk",
          "solk",
          "solkhk",
          "solkk",
          "labb",
          "labhb",
          "lab",
          "lahb",
          "la",
          "lahk",
          "lak",
          "lakhk",
          "lakk",
          "sibb",
          "sibhb",
          "sib",
          "sihb",
          "si",
          "sihk",
          "sik",
          "sikhk",
          "sikk",
        ],
      };

      for (const language in noteNamesByLanguage) {
        for (const noteName of noteNamesByLanguage[language]) {
          const {tokens} = grammar.tokenizeLine(`{ ${noteName} }`);
          expect(tokens.length).toBe(5);
          expect(tokens[0]).toEqual({value: "{", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
          expect(tokens[1]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
          expect(tokens[2]).toEqual({value: noteName, scopes: ["source.lilypond", "meta.expression-block.lilypond", "text.note-name.lilypond"]});
          expect(tokens[3]).toEqual({value: " ", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
          expect(tokens[4]).toEqual({value: "}", scopes: ["source.lilypond", "meta.expression-block.lilypond"]});
        }
      }
    });
  });
});
