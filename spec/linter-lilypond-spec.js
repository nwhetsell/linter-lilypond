const dedent = require("dedent-js");
const fs = require("fs");
const path = require("path");

const lint = require("../lib/linter-lilypond").provideLinter().lint;

describe("linter-lilypond", () => {
  const preamble = '\\version "2.20.0"\n';

  beforeEach(() => {
    waitsForPromise(() => atom.packages.activatePackage("linter-lilypond"));
  });

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

    it("tokenizes music expressions", () => {
      const lines = grammar.tokenizeLines(dedent`
        \\relative c' {
          c1 2 4 8 16 32 64. 128
          c2*2/3 c~c c2 *%{%}2%{%}
          r8 c[ r c] s2 | R1
          c8-^ c-+ c-- c-! c-> c-. c4-_
          c\\< c\\! c\\> c\\!
          <c e-> g>2q
          << e1 \\\\ c >>
          c8( c) c\\( c\\) c\\=1( c\\=1) c\\=%{%}"label"\\( c\\="label"%{%}\\)
          \\[ c2 c \\]
          c4^"up" c_"down" c2-"default"
          ces'!4 ces,? c='2
        }
      `);

      let tokens = lines[0];
      expect(tokens.length).toBe(6);
      expect(tokens[0]).toEqual({value: "\\relative", scopes: ["source.lilypond", "meta.relative.lilypond", "support.function.lilypond"]});
      expect(tokens[1]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond"]});
      expect(tokens[2]).toEqual({value: "c", scopes: ["source.lilypond", "meta.relative.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[3]).toEqual({value: "'", scopes: ["source.lilypond", "meta.relative.lilypond", "keyword.operator.transpose-octave.up.lilypond"]});
      expect(tokens[4]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond"]});
      expect(tokens[5]).toEqual({value: "{", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});

      tokens = lines[1];
      expect(tokens.length).toBe(18);
      expect(tokens[0]).toEqual({value: "  ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[1]).toEqual({value: "c", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[2]).toEqual({value: "1", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[3]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[4]).toEqual({value: "2", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[5]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[6]).toEqual({value: "4", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[7]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[8]).toEqual({value: "8", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[9]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[10]).toEqual({value: "16", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[11]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[12]).toEqual({value: "32", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[13]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[14]).toEqual({value: "64", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[15]).toEqual({value: ".", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "keyword.operator.dot.lilypond"]});
      expect(tokens[16]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[17]).toEqual({value: "128", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "constant.numeric.integer.lilypond"]});

      tokens = lines[2];
      expect(tokens.length).toBe(21);
      expect(tokens[0]).toEqual({value: "  ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[1]).toEqual({value: "c", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[2]).toEqual({value: "2", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[3]).toEqual({value: "*", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.duration-scale.lilypond", "keyword.operator.scale-duration.lilypond"]});
      expect(tokens[4]).toEqual({value: "2", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.duration-scale.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[5]).toEqual({value: "/", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.duration-scale.lilypond", "keyword.operator.forward-slash.lilypond"]});
      expect(tokens[6]).toEqual({value: "3", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.duration-scale.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[7]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[8]).toEqual({value: "c", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[9]).toEqual({value: "~", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "keyword.operator.tie.lilypond"]});
      expect(tokens[10]).toEqual({value: "c", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[11]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[12]).toEqual({value: "c", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[13]).toEqual({value: "2", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[14]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[15]).toEqual({value: "*", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.duration-scale.lilypond", "keyword.operator.scale-duration.lilypond"]});
      expect(tokens[16]).toEqual({value: "%{", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.duration-scale.lilypond", "comment.block.lilypond", "punctuation.definition.comment.begin.lilypond"]});
      expect(tokens[17]).toEqual({value: "%}", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.duration-scale.lilypond", "comment.block.lilypond", "punctuation.definition.comment.end.lilypond"]});
      expect(tokens[18]).toEqual({value: "2", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.duration-scale.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[19]).toEqual({value: "%{", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "comment.block.lilypond", "punctuation.definition.comment.begin.lilypond"]});
      expect(tokens[20]).toEqual({value: "%}", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "comment.block.lilypond", "punctuation.definition.comment.end.lilypond"]});

      tokens = lines[3];
      expect(tokens.length).toBe(19);
      expect(tokens[0]).toEqual({value: "  ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[1]).toEqual({value: "r", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "support.variable.rest.lilypond"]});
      expect(tokens[2]).toEqual({value: "8", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[3]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[4]).toEqual({value: "c", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[5]).toEqual({value: "[", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "keyword.operator.beam.begin.lilypond"]});
      expect(tokens[6]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[7]).toEqual({value: "r", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "support.variable.rest.lilypond"]});
      expect(tokens[8]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[9]).toEqual({value: "c", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[10]).toEqual({value: "]", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "keyword.operator.beam.end.lilypond"]});
      expect(tokens[11]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[12]).toEqual({value: "s", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "support.variable.rest.lilypond"]});
      expect(tokens[13]).toEqual({value: "2", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[14]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[15]).toEqual({value: "|", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "keyword.operator.bar-check.lilypond"]});
      expect(tokens[16]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[17]).toEqual({value: "R", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "support.variable.rest.lilypond"]});
      expect(tokens[18]).toEqual({value: "1", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "constant.numeric.integer.lilypond"]});

      tokens = lines[4];
      expect(tokens.length).toBe(23);
      expect(tokens[0]).toEqual({value: "  ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[1]).toEqual({value: "c", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[2]).toEqual({value: "8", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[3]).toEqual({value: "-^", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "keyword.operator.articulation.marcato.lilypond"]});
      expect(tokens[4]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[5]).toEqual({value: "c", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[6]).toEqual({value: "-+", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "keyword.operator.articulation.stopped.lilypond"]});
      expect(tokens[7]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[8]).toEqual({value: "c", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[9]).toEqual({value: "--", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "keyword.operator.articulation.tenuto.lilypond"]});
      expect(tokens[10]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[11]).toEqual({value: "c", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[12]).toEqual({value: "-!", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "keyword.operator.articulation.staccatissimo.lilypond"]});
      expect(tokens[13]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[14]).toEqual({value: "c", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[15]).toEqual({value: "->", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "keyword.operator.articulation.accent.lilypond"]});
      expect(tokens[16]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[17]).toEqual({value: "c", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[18]).toEqual({value: "-.", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "keyword.operator.articulation.staccato.lilypond"]});
      expect(tokens[19]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[20]).toEqual({value: "c", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[21]).toEqual({value: "4", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[22]).toEqual({value: "-_", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "keyword.operator.articulation.portato.lilypond"]});

      tokens = lines[5];
      expect(tokens.length).toBe(12);
      expect(tokens[0]).toEqual({value: "  ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[1]).toEqual({value: "c", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[2]).toEqual({value: "\\<", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "keyword.operator.dynamic-mark.begin.crescendo.lilypond"]});
      expect(tokens[3]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[4]).toEqual({value: "c", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[5]).toEqual({value: "\\!", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "keyword.operator.dynamic-mark.end.lilypond"]});
      expect(tokens[6]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[7]).toEqual({value: "c", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[8]).toEqual({value: "\\>", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "keyword.operator.dynamic-mark.begin.decrescendo.lilypond"]});
      expect(tokens[9]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[10]).toEqual({value: "c", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[11]).toEqual({value: "\\!", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "keyword.operator.dynamic-mark.end.lilypond"]});

      tokens = lines[6];
      expect(tokens.length).toBe(11);
      expect(tokens[0]).toEqual({value: "  ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[1]).toEqual({value: "<", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.chord.lilypond", "punctuation.definition.chord.begin.lilypond"]});
      expect(tokens[2]).toEqual({value: "c", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.chord.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[3]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.chord.lilypond"]});
      expect(tokens[4]).toEqual({value: "e", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.chord.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[5]).toEqual({value: "->", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.chord.lilypond", "keyword.operator.articulation.accent.lilypond"]});
      expect(tokens[6]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.chord.lilypond"]});
      expect(tokens[7]).toEqual({value: "g", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.chord.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[8]).toEqual({value: ">", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.chord.lilypond", "punctuation.definition.chord.end.lilypond"]});
      expect(tokens[9]).toEqual({value: "2", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[10]).toEqual({value: "q", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "keyword.operator.chord-repetition.lilypond"]});

      tokens = lines[7];
      expect(tokens.length).toBe(11);
      expect(tokens[0]).toEqual({value: "  ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[1]).toEqual({value: "<<", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.simultaneous-expressions.lilypond", "punctuation.simultaneous-expressions.begin.lilypond"]});
      expect(tokens[2]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.simultaneous-expressions.lilypond"]});
      expect(tokens[3]).toEqual({value: "e", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.simultaneous-expressions.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[4]).toEqual({value: "1", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.simultaneous-expressions.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[5]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.simultaneous-expressions.lilypond"]});
      expect(tokens[6]).toEqual({value: "\\\\", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.simultaneous-expressions.lilypond", "meta.separator.simultaneous-expressions.lilypond"]});
      expect(tokens[7]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.simultaneous-expressions.lilypond"]});
      expect(tokens[8]).toEqual({value: "c", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.simultaneous-expressions.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[9]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.simultaneous-expressions.lilypond"]});
      expect(tokens[10]).toEqual({value: ">>", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.simultaneous-expressions.lilypond", "punctuation.simultaneous-expressions.end.lilypond"]});

      tokens = lines[8];
      expect(tokens.length).toBe(41);
      expect(tokens[0]).toEqual({value: "  ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[1]).toEqual({value: "c", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[2]).toEqual({value: "8", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[3]).toEqual({value: "(", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "keyword.operator.slur.begin.lilypond"]});
      expect(tokens[4]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[5]).toEqual({value: "c", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[6]).toEqual({value: ")", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "keyword.operator.slur.end.lilypond"]});
      expect(tokens[7]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[8]).toEqual({value: "c", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[9]).toEqual({value: "\\(", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "keyword.operator.phrasing-slur.begin.lilypond"]});
      expect(tokens[10]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[11]).toEqual({value: "c", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[12]).toEqual({value: "\\)", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "keyword.operator.phrasing-slur.end.lilypond"]});
      expect(tokens[13]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[14]).toEqual({value: "c", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[15]).toEqual({value: "\\=", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.slur-label.lilypond", "entity.punctuation.slur-label.lilypond"]});
      expect(tokens[16]).toEqual({value: "1", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.slur-label.lilypond", "entity.name.slur-label.lilypond"]});
      expect(tokens[17]).toEqual({value: "(", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "keyword.operator.slur.begin.lilypond"]});
      expect(tokens[18]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[19]).toEqual({value: "c", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[20]).toEqual({value: "\\=", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.slur-label.lilypond", "entity.punctuation.slur-label.lilypond"]});
      expect(tokens[21]).toEqual({value: "1", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.slur-label.lilypond", "entity.name.slur-label.lilypond"]});
      expect(tokens[22]).toEqual({value: ")", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "keyword.operator.slur.end.lilypond"]});
      expect(tokens[23]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[24]).toEqual({value: "c", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[25]).toEqual({value: "\\=", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.slur-label.lilypond", "entity.punctuation.slur-label.lilypond"]});
      expect(tokens[26]).toEqual({value: "%{", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.slur-label.lilypond", "comment.block.lilypond", "punctuation.definition.comment.begin.lilypond"]});
      expect(tokens[27]).toEqual({value: "%}", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.slur-label.lilypond", "comment.block.lilypond", "punctuation.definition.comment.end.lilypond"]});
      expect(tokens[28]).toEqual({value: '"', scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.slur-label.lilypond", "string.lilypond", "punctuation.definition.string.begin.lilypond"]});
      expect(tokens[29]).toEqual({value: "label", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.slur-label.lilypond", "string.lilypond", "entity.name.slur-label.lilypond"]});
      expect(tokens[30]).toEqual({value: '"', scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.slur-label.lilypond", "string.lilypond", "punctuation.definition.string.end.lilypond"]});
      expect(tokens[31]).toEqual({value: "\\(", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "keyword.operator.phrasing-slur.begin.lilypond"]});
      expect(tokens[32]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[33]).toEqual({value: "c", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[34]).toEqual({value: "\\=", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.slur-label.lilypond", "entity.punctuation.slur-label.lilypond"]});
      expect(tokens[35]).toEqual({value: '"', scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.slur-label.lilypond", "string.lilypond", "punctuation.definition.string.begin.lilypond"]});
      expect(tokens[36]).toEqual({value: "label", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.slur-label.lilypond", "string.lilypond", "entity.name.slur-label.lilypond"]});
      expect(tokens[37]).toEqual({value: '"', scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.slur-label.lilypond", "string.lilypond", "punctuation.definition.string.end.lilypond"]});
      expect(tokens[38]).toEqual({value: "%{", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.slur-label.lilypond", "comment.block.lilypond", "punctuation.definition.comment.begin.lilypond"]});
      expect(tokens[39]).toEqual({value: "%}", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "meta.slur-label.lilypond", "comment.block.lilypond", "punctuation.definition.comment.end.lilypond"]});
      expect(tokens[40]).toEqual({value: "\\)", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "keyword.operator.phrasing-slur.end.lilypond"]});

      tokens = lines[9];
      expect(tokens.length).toBe(9);
      expect(tokens[0]).toEqual({value: "  ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[1]).toEqual({value: "\\[", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "invalid.deprecated.ligature.begin.lilypond"]});
      expect(tokens[2]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[3]).toEqual({value: "c", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[4]).toEqual({value: "2", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[5]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[6]).toEqual({value: "c", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[7]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[8]).toEqual({value: "\\]", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "invalid.deprecated.ligature.end.lilypond"]});

      tokens = lines[10];
      expect(tokens.length).toBe(20);
      expect(tokens[0]).toEqual({value: "  ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[1]).toEqual({value: "c", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[2]).toEqual({value: "4", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[3]).toEqual({value: "^", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "keyword.operator.articulation-direction-indicator.up.lilypond"]});
      expect(tokens[4]).toEqual({value: '"', scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "string.lilypond", "punctuation.definition.string.begin.lilypond"]});
      expect(tokens[5]).toEqual({value: "up", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "string.lilypond"]});
      expect(tokens[6]).toEqual({value: '"', scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "string.lilypond", "punctuation.definition.string.end.lilypond"]});
      expect(tokens[7]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[8]).toEqual({value: "c", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[9]).toEqual({value: "_", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "keyword.operator.articulation-direction-indicator.down.lilypond"]});
      expect(tokens[10]).toEqual({value: '"', scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "string.lilypond", "punctuation.definition.string.begin.lilypond"]});
      expect(tokens[11]).toEqual({value: "down", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "string.lilypond"]});
      expect(tokens[12]).toEqual({value: '"', scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "string.lilypond", "punctuation.definition.string.end.lilypond"]});
      expect(tokens[13]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[14]).toEqual({value: "c", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[15]).toEqual({value: "2", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[16]).toEqual({value: "-", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "keyword.operator.articulation-direction-indicator.default.lilypond"]});
      expect(tokens[17]).toEqual({value: '"', scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "string.lilypond", "punctuation.definition.string.begin.lilypond"]});
      expect(tokens[18]).toEqual({value: "default", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "string.lilypond"]});
      expect(tokens[19]).toEqual({value: '"', scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "string.lilypond", "punctuation.definition.string.end.lilypond"]});

      tokens = lines[11];
      expect(tokens.length).toBe(14);
      expect(tokens[0]).toEqual({value: "  ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[1]).toEqual({value: "ces", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[2]).toEqual({value: "'", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "keyword.operator.transpose-octave.up.lilypond"]});
      expect(tokens[3]).toEqual({value: "!", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "keyword.operator.accidental.reminder.lilypond"]});
      expect(tokens[4]).toEqual({value: "4", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "constant.numeric.integer.lilypond"]});
      expect(tokens[5]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[6]).toEqual({value: "ces", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[7]).toEqual({value: ",", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "keyword.operator.transpose-octave.down.lilypond"]});
      expect(tokens[8]).toEqual({value: "?", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "keyword.operator.accidental.cautionary.lilypond"]});
      expect(tokens[9]).toEqual({value: " ", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
      expect(tokens[10]).toEqual({value: "c", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "support.variable.note-name.lilypond"]});
      expect(tokens[11]).toEqual({value: "=", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "keyword.operator.equals-sign.lilypond"]});
      expect(tokens[12]).toEqual({value: "'", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "keyword.operator.transpose-octave.up.lilypond"]});
      expect(tokens[13]).toEqual({value: "2", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond", "constant.numeric.integer.lilypond"]});

      tokens = lines[12];
      expect(tokens.length).toBe(1);
      expect(tokens[0]).toEqual({value: "}", scopes: ["source.lilypond", "meta.relative.lilypond", "meta.music-expression.lilypond"]});
    });

    it("tokenizes markup blocks", () => {
      for (const command of ["\\markup", "\\markuplist"]) {
        let {tokens} = grammar.tokenizeLine(`${command} \\bold text `);
        expect(tokens.length).toBe(6);
        expect(tokens[0]).toEqual({value: command, scopes: ["source.lilypond", "meta.markup-block.lilypond", "keyword.other.lilypond"]});
        expect(tokens[1]).toEqual({value: " ", scopes: ["source.lilypond", "meta.markup-block.lilypond"]});
        expect(tokens[2]).toEqual({value: "\\bold", scopes: ["source.lilypond", "meta.markup-block.lilypond", "support.function.lilypond"]});
        expect(tokens[3]).toEqual({value: " ", scopes: ["source.lilypond", "meta.markup-block.lilypond"]});
        expect(tokens[4]).toEqual({value: "text", scopes: ["source.lilypond", "meta.markup-block.lilypond", "meta.markup-expression.lilypond"]});
        expect(tokens[5]).toEqual({value: " ", scopes: ["source.lilypond"]});

        tokens = grammar.tokenizeLine(`${command} \\bold \\italic text `).tokens;
        expect(tokens.length).toBe(8);
        expect(tokens[0]).toEqual({value: command, scopes: ["source.lilypond", "meta.markup-block.lilypond", "keyword.other.lilypond"]});
        expect(tokens[1]).toEqual({value: " ", scopes: ["source.lilypond", "meta.markup-block.lilypond"]});
        expect(tokens[2]).toEqual({value: "\\bold", scopes: ["source.lilypond", "meta.markup-block.lilypond", "support.function.lilypond"]});
        expect(tokens[3]).toEqual({value: " ", scopes: ["source.lilypond", "meta.markup-block.lilypond"]});
        expect(tokens[4]).toEqual({value: "\\italic", scopes: ["source.lilypond", "meta.markup-block.lilypond", "support.function.lilypond"]});
        expect(tokens[5]).toEqual({value: " ", scopes: ["source.lilypond", "meta.markup-block.lilypond"]});
        expect(tokens[6]).toEqual({value: "text", scopes: ["source.lilypond", "meta.markup-block.lilypond", "meta.markup-expression.lilypond"]});
        expect(tokens[7]).toEqual({value: " ", scopes: ["source.lilypond"]});

        tokens = grammar.tokenizeLine(`${command} %{%} { \\bold "text" }`).tokens;
        expect(tokens.length).toBe(14);
        expect(tokens[0]).toEqual({value: command, scopes: ["source.lilypond", "meta.markup-block.lilypond", "keyword.other.lilypond"]});
        expect(tokens[1]).toEqual({value: " ", scopes: ["source.lilypond", "meta.markup-block.lilypond"]});
        expect(tokens[2]).toEqual({value: "%{", scopes: ["source.lilypond", "meta.markup-block.lilypond", "comment.block.lilypond", "punctuation.definition.comment.begin.lilypond"]});
        expect(tokens[3]).toEqual({value: "%}", scopes: ["source.lilypond", "meta.markup-block.lilypond", "comment.block.lilypond", "punctuation.definition.comment.end.lilypond"]});
        expect(tokens[4]).toEqual({value: " ", scopes: ["source.lilypond", "meta.markup-block.lilypond"]});
        expect(tokens[5]).toEqual({value: "{", scopes: ["source.lilypond", "meta.markup-block.lilypond", "meta.markup-expression.lilypond"]});
        expect(tokens[6]).toEqual({value: " ", scopes: ["source.lilypond", "meta.markup-block.lilypond", "meta.markup-expression.lilypond"]});
        expect(tokens[7]).toEqual({value: "\\bold", scopes: ["source.lilypond", "meta.markup-block.lilypond", "meta.markup-expression.lilypond", "support.function.lilypond"]});
        expect(tokens[8]).toEqual({value: " ", scopes: ["source.lilypond", "meta.markup-block.lilypond", "meta.markup-expression.lilypond"]});
        expect(tokens[9]).toEqual({value: '"', scopes: ["source.lilypond", "meta.markup-block.lilypond", "meta.markup-expression.lilypond", "string.lilypond", "punctuation.definition.string.begin.lilypond"]});
        expect(tokens[10]).toEqual({value: "text", scopes: ["source.lilypond", "meta.markup-block.lilypond", "meta.markup-expression.lilypond", "string.lilypond"]});
        expect(tokens[11]).toEqual({value: '"', scopes: ["source.lilypond", "meta.markup-block.lilypond", "meta.markup-expression.lilypond", "string.lilypond", "punctuation.definition.string.end.lilypond"]});
        expect(tokens[12]).toEqual({value: " ", scopes: ["source.lilypond", "meta.markup-block.lilypond", "meta.markup-expression.lilypond"]});
        expect(tokens[13]).toEqual({value: "}", scopes: ["source.lilypond", "meta.markup-block.lilypond", "meta.markup-expression.lilypond"]});

        const lines = grammar.tokenizeLines(dedent`
          ${command} { \\bold { ten. \\italic dolce e semplice
          }}
        `);
        tokens = lines[0];
        expect(tokens.length).toBe(10);
        expect(tokens[0]).toEqual({value: command, scopes: ["source.lilypond", "meta.markup-block.lilypond", "keyword.other.lilypond"]});
        expect(tokens[1]).toEqual({value: " ", scopes: ["source.lilypond", "meta.markup-block.lilypond"]});
        expect(tokens[2]).toEqual({value: "{", scopes: ["source.lilypond", "meta.markup-block.lilypond", "meta.markup-expression.lilypond"]});
        expect(tokens[3]).toEqual({value: " ", scopes: ["source.lilypond", "meta.markup-block.lilypond", "meta.markup-expression.lilypond"]});
        expect(tokens[4]).toEqual({value: "\\bold", scopes: ["source.lilypond", "meta.markup-block.lilypond", "meta.markup-expression.lilypond", "support.function.lilypond"]});
        expect(tokens[5]).toEqual({value: " ", scopes: ["source.lilypond", "meta.markup-block.lilypond", "meta.markup-expression.lilypond"]});
        expect(tokens[6]).toEqual({value: "{", scopes: ["source.lilypond", "meta.markup-block.lilypond", "meta.markup-expression.lilypond", "meta.markup-expression.lilypond"]});
        expect(tokens[7]).toEqual({value: " ten. ", scopes: ["source.lilypond", "meta.markup-block.lilypond", "meta.markup-expression.lilypond", "meta.markup-expression.lilypond"]});
        expect(tokens[8]).toEqual({value: "\\italic", scopes: ["source.lilypond", "meta.markup-block.lilypond", "meta.markup-expression.lilypond", "meta.markup-expression.lilypond", "support.function.lilypond"]});
        expect(tokens[9]).toEqual({value: " dolce e semplice", scopes: ["source.lilypond", "meta.markup-block.lilypond", "meta.markup-expression.lilypond", "meta.markup-expression.lilypond"]});
        tokens = lines[1];
        expect(tokens.length).toBe(2);
        expect(tokens[0]).toEqual({value: "}", scopes: ["source.lilypond", "meta.markup-block.lilypond", "meta.markup-expression.lilypond", "meta.markup-expression.lilypond"]});
        expect(tokens[1]).toEqual({value: "}", scopes: ["source.lilypond", "meta.markup-block.lilypond", "meta.markup-expression.lilypond"]});
      }
    });

    it("tokenizes lyric mode", () => {
      for (const command of ["\\addlyrics", "\\lyricmode", "\\lyrics", "\\lyricsto"]) {
        let {tokens} = grammar.tokenizeLine(`${command} %{%} { a -- b_c~d __ _ }`);
        expect(tokens.length).toBe(18);
        expect(tokens[0]).toEqual({value: command, scopes: ["source.lilypond", "meta.lyric-mode.lilypond", "keyword.other.lilypond"]});
        expect(tokens[1]).toEqual({value: " ", scopes: ["source.lilypond", "meta.lyric-mode.lilypond"]});
        expect(tokens[2]).toEqual({value: "%{", scopes: ["source.lilypond", "meta.lyric-mode.lilypond", "comment.block.lilypond", "punctuation.definition.comment.begin.lilypond"]});
        expect(tokens[3]).toEqual({value: "%}", scopes: ["source.lilypond", "meta.lyric-mode.lilypond", "comment.block.lilypond", "punctuation.definition.comment.end.lilypond"]});
        expect(tokens[4]).toEqual({value: " ", scopes: ["source.lilypond", "meta.lyric-mode.lilypond"]});
        expect(tokens[5]).toEqual({value: "{", scopes: ["source.lilypond", "meta.lyric-mode.lilypond", "meta.lyric-expression.lilypond"]});
        expect(tokens[6]).toEqual({value: " a ", scopes: ["source.lilypond", "meta.lyric-mode.lilypond", "meta.lyric-expression.lilypond"]});
        expect(tokens[7]).toEqual({value: "--", scopes: ["source.lilypond", "meta.lyric-mode.lilypond", "meta.lyric-expression.lilypond", "keyword.operator.lyric.syllable-hyphen.lilypond"]});
        expect(tokens[8]).toEqual({value: " b", scopes: ["source.lilypond", "meta.lyric-mode.lilypond", "meta.lyric-expression.lilypond"]});
        expect(tokens[9]).toEqual({value: "_", scopes: ["source.lilypond", "meta.lyric-mode.lilypond", "meta.lyric-expression.lilypond", "keyword.operator.lyric.syllable-space.lilypond"]});
        expect(tokens[10]).toEqual({value: "c", scopes: ["source.lilypond", "meta.lyric-mode.lilypond", "meta.lyric-expression.lilypond"]});
        expect(tokens[11]).toEqual({value: "~", scopes: ["source.lilypond", "meta.lyric-mode.lilypond", "meta.lyric-expression.lilypond", "keyword.operator.lyric.tie.lilypond"]});
        expect(tokens[12]).toEqual({value: "d ", scopes: ["source.lilypond", "meta.lyric-mode.lilypond", "meta.lyric-expression.lilypond"]});
        expect(tokens[13]).toEqual({value: "__", scopes: ["source.lilypond", "meta.lyric-mode.lilypond", "meta.lyric-expression.lilypond", "keyword.operator.lyric.extender-line.lilypond"]});
        expect(tokens[14]).toEqual({value: " ", scopes: ["source.lilypond", "meta.lyric-mode.lilypond", "meta.lyric-expression.lilypond"]});
        expect(tokens[15]).toEqual({value: "_", scopes: ["source.lilypond", "meta.lyric-mode.lilypond", "meta.lyric-expression.lilypond", "keyword.operator.lyric.melisma.lilypond"]});
        expect(tokens[16]).toEqual({value: " ", scopes: ["source.lilypond", "meta.lyric-mode.lilypond", "meta.lyric-expression.lilypond"]});
        expect(tokens[17]).toEqual({value: "}", scopes: ["source.lilypond", "meta.lyric-mode.lilypond", "meta.lyric-expression.lilypond"]});

        const lines = grammar.tokenizeLines(dedent`
          ${command} {
          }%{%}
        `);
        tokens = lines[0];
        expect(tokens.length).toBe(3);
        expect(tokens[0]).toEqual({value: command, scopes: ["source.lilypond", "meta.lyric-mode.lilypond", "keyword.other.lilypond"]});
        expect(tokens[1]).toEqual({value: " ", scopes: ["source.lilypond", "meta.lyric-mode.lilypond"]});
        expect(tokens[2]).toEqual({value: "{", scopes: ["source.lilypond", "meta.lyric-mode.lilypond", "meta.lyric-expression.lilypond"]});
        tokens = lines[1];
        expect(tokens.length).toBe(3);
        expect(tokens[0]).toEqual({value: "}", scopes: ["source.lilypond", "meta.lyric-mode.lilypond", "meta.lyric-expression.lilypond"]});
        expect(tokens[1]).toEqual({value: "%{", scopes: ["source.lilypond", "comment.block.lilypond", "punctuation.definition.comment.begin.lilypond"]});
        expect(tokens[2]).toEqual({value: "%}", scopes: ["source.lilypond", "comment.block.lilypond", "punctuation.definition.comment.end.lilypond"]});
      }
    });

    it("tokenizes drum mode", () => {
      for (const command of ["\\drummode", "\\drums"]) {
        let {tokens} = grammar.tokenizeLine(`${command} %{%} { bassdrum c }`);
        expect(tokens.length).toBe(10);
        expect(tokens[0]).toEqual({value: command, scopes: ["source.lilypond", "meta.drum-mode.lilypond", "keyword.other.lilypond"]});
        expect(tokens[1]).toEqual({value: " ", scopes: ["source.lilypond", "meta.drum-mode.lilypond"]});
        expect(tokens[2]).toEqual({value: "%{", scopes: ["source.lilypond", "meta.drum-mode.lilypond", "comment.block.lilypond", "punctuation.definition.comment.begin.lilypond"]});
        expect(tokens[3]).toEqual({value: "%}", scopes: ["source.lilypond", "meta.drum-mode.lilypond", "comment.block.lilypond", "punctuation.definition.comment.end.lilypond"]});
        expect(tokens[4]).toEqual({value: " ", scopes: ["source.lilypond", "meta.drum-mode.lilypond"]});
        expect(tokens[5]).toEqual({value: "{", scopes: ["source.lilypond", "meta.drum-mode.lilypond", "meta.drum-expression.lilypond"]});
        expect(tokens[6]).toEqual({value: " ", scopes: ["source.lilypond", "meta.drum-mode.lilypond", "meta.drum-expression.lilypond"]});
        expect(tokens[7]).toEqual({value: "bassdrum", scopes: ["source.lilypond", "meta.drum-mode.lilypond", "meta.drum-expression.lilypond", "support.variable.percussion-note.lilypond"]});
        expect(tokens[8]).toEqual({value: " c ", scopes: ["source.lilypond", "meta.drum-mode.lilypond", "meta.drum-expression.lilypond"]});
        expect(tokens[9]).toEqual({value: "}", scopes: ["source.lilypond", "meta.drum-mode.lilypond", "meta.drum-expression.lilypond"]});

        const lines = grammar.tokenizeLines(dedent`
          ${command} { bassdrum
          }%{%}
        `);
        tokens = lines[0];
        expect(tokens.length).toBe(5);
        expect(tokens[0]).toEqual({value: command, scopes: ["source.lilypond", "meta.drum-mode.lilypond", "keyword.other.lilypond"]});
        expect(tokens[1]).toEqual({value: " ", scopes: ["source.lilypond", "meta.drum-mode.lilypond"]});
        expect(tokens[2]).toEqual({value: "{", scopes: ["source.lilypond", "meta.drum-mode.lilypond", "meta.drum-expression.lilypond"]});
        expect(tokens[3]).toEqual({value: " ", scopes: ["source.lilypond", "meta.drum-mode.lilypond", "meta.drum-expression.lilypond"]});
        expect(tokens[4]).toEqual({value: "bassdrum", scopes: ["source.lilypond", "meta.drum-mode.lilypond", "meta.drum-expression.lilypond", "support.variable.percussion-note.lilypond"]});
        tokens = lines[1];
        expect(tokens.length).toBe(3);
        expect(tokens[0]).toEqual({value: "}", scopes: ["source.lilypond", "meta.drum-mode.lilypond", "meta.drum-expression.lilypond"]});
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

    it("tokenizes figure mode", () => {
      for (const command of ["\\figuremode", "\\figures"]) {
        let {tokens} = grammar.tokenizeLine(`${command} %{%} { <1+%{%}2- _!> <4\\+ [5/ 6\\\\\\!]> }`);
        expect(tokens.length).toBe(34);
        expect(tokens[0]).toEqual({value: command, scopes: ["source.lilypond", "meta.figure-mode.lilypond", "keyword.other.lilypond"]});
        expect(tokens[1]).toEqual({value: " ", scopes: ["source.lilypond", "meta.figure-mode.lilypond"]});
        expect(tokens[2]).toEqual({value: "%{", scopes: ["source.lilypond", "meta.figure-mode.lilypond", "comment.block.lilypond", "punctuation.definition.comment.begin.lilypond"]});
        expect(tokens[3]).toEqual({value: "%}", scopes: ["source.lilypond", "meta.figure-mode.lilypond", "comment.block.lilypond", "punctuation.definition.comment.end.lilypond"]});
        expect(tokens[4]).toEqual({value: " ", scopes: ["source.lilypond", "meta.figure-mode.lilypond"]});
        expect(tokens[5]).toEqual({value: "{", scopes: ["source.lilypond", "meta.figure-mode.lilypond", "meta.figure-expression.lilypond"]});
        expect(tokens[6]).toEqual({value: " ", scopes: ["source.lilypond", "meta.figure-mode.lilypond", "meta.figure-expression.lilypond"]});
        expect(tokens[7]).toEqual({value: "<", scopes: ["source.lilypond", "meta.figure-mode.lilypond", "meta.figure-expression.lilypond", "meta.figure-group.lilypond", "punctuation.definition.figure-group.begin.lilypond"]});
        expect(tokens[8]).toEqual({value: "1", scopes: ["source.lilypond", "meta.figure-mode.lilypond", "meta.figure-expression.lilypond", "meta.figure-group.lilypond", "constant.numeric.integer.lilypond"]});
        expect(tokens[9]).toEqual({value: "+", scopes: ["source.lilypond", "meta.figure-mode.lilypond", "meta.figure-expression.lilypond", "meta.figure-group.lilypond", "keyword.operator.figure.accidental.sharp.lilypond"]});
        expect(tokens[10]).toEqual({value: "%{", scopes: ["source.lilypond", "meta.figure-mode.lilypond", "meta.figure-expression.lilypond", "meta.figure-group.lilypond", "comment.block.lilypond", "punctuation.definition.comment.begin.lilypond"]});
        expect(tokens[11]).toEqual({value: "%}", scopes: ["source.lilypond", "meta.figure-mode.lilypond", "meta.figure-expression.lilypond", "meta.figure-group.lilypond", "comment.block.lilypond", "punctuation.definition.comment.end.lilypond"]});
        expect(tokens[12]).toEqual({value: "2", scopes: ["source.lilypond", "meta.figure-mode.lilypond", "meta.figure-expression.lilypond", "meta.figure-group.lilypond", "constant.numeric.integer.lilypond"]});
        expect(tokens[13]).toEqual({value: "-", scopes: ["source.lilypond", "meta.figure-mode.lilypond", "meta.figure-expression.lilypond", "meta.figure-group.lilypond", "keyword.operator.figure.accidental.flat.lilypond"]});
        expect(tokens[14]).toEqual({value: " ", scopes: ["source.lilypond", "meta.figure-mode.lilypond", "meta.figure-expression.lilypond", "meta.figure-group.lilypond"]});
        expect(tokens[15]).toEqual({value: "_", scopes: ["source.lilypond", "meta.figure-mode.lilypond", "meta.figure-expression.lilypond", "meta.figure-group.lilypond", "support.variable.figure.hidden-third.lilypond"]});
        expect(tokens[16]).toEqual({value: "!", scopes: ["source.lilypond", "meta.figure-mode.lilypond", "meta.figure-expression.lilypond", "meta.figure-group.lilypond", "keyword.operator.figure.accidental.natural.lilypond"]});
        expect(tokens[17]).toEqual({value: ">", scopes: ["source.lilypond", "meta.figure-mode.lilypond", "meta.figure-expression.lilypond", "meta.figure-group.lilypond", "punctuation.definition.figure-group.end.lilypond"]});
        expect(tokens[18]).toEqual({value: " ", scopes: ["source.lilypond", "meta.figure-mode.lilypond", "meta.figure-expression.lilypond"]});
        expect(tokens[19]).toEqual({value: "<", scopes: ["source.lilypond", "meta.figure-mode.lilypond", "meta.figure-expression.lilypond", "meta.figure-group.lilypond", "punctuation.definition.figure-group.begin.lilypond"]});
        expect(tokens[20]).toEqual({value: "4", scopes: ["source.lilypond", "meta.figure-mode.lilypond", "meta.figure-expression.lilypond", "meta.figure-group.lilypond", "constant.numeric.integer.lilypond"]});
        expect(tokens[21]).toEqual({value: "\\+", scopes: ["source.lilypond", "meta.figure-mode.lilypond", "meta.figure-expression.lilypond", "meta.figure-group.lilypond", "keyword.operator.figure.augmented.lilypond"]});
        expect(tokens[22]).toEqual({value: " ", scopes: ["source.lilypond", "meta.figure-mode.lilypond", "meta.figure-expression.lilypond", "meta.figure-group.lilypond"]});
        expect(tokens[23]).toEqual({value: "[", scopes: ["source.lilypond", "meta.figure-mode.lilypond", "meta.figure-expression.lilypond", "meta.figure-group.lilypond", "meta.figure-bracket.lilypond", "punctuation.definition.figure-bracket.begin.lilypond"]});
        expect(tokens[24]).toEqual({value: "5", scopes: ["source.lilypond", "meta.figure-mode.lilypond", "meta.figure-expression.lilypond", "meta.figure-group.lilypond", "meta.figure-bracket.lilypond", "constant.numeric.integer.lilypond"]});
        expect(tokens[25]).toEqual({value: "/", scopes: ["source.lilypond", "meta.figure-mode.lilypond", "meta.figure-expression.lilypond", "meta.figure-group.lilypond", "meta.figure-bracket.lilypond", "keyword.operator.figure.diminished.lilypond"]});
        expect(tokens[26]).toEqual({value: " ", scopes: ["source.lilypond", "meta.figure-mode.lilypond", "meta.figure-expression.lilypond", "meta.figure-group.lilypond", "meta.figure-bracket.lilypond"]});
        expect(tokens[27]).toEqual({value: "6", scopes: ["source.lilypond", "meta.figure-mode.lilypond", "meta.figure-expression.lilypond", "meta.figure-group.lilypond", "meta.figure-bracket.lilypond", "constant.numeric.integer.lilypond"]});
        expect(tokens[28]).toEqual({value: "\\\\", scopes: ["source.lilypond", "meta.figure-mode.lilypond", "meta.figure-expression.lilypond", "meta.figure-group.lilypond", "meta.figure-bracket.lilypond", "keyword.operator.figure.raised-sixth.lilypond"]});
        expect(tokens[29]).toEqual({value: "\\!", scopes: ["source.lilypond", "meta.figure-mode.lilypond", "meta.figure-expression.lilypond", "meta.figure-group.lilypond", "meta.figure-bracket.lilypond", "keyword.operator.figure.end-continuation-line.lilypond"]});
        expect(tokens[30]).toEqual({value: "]", scopes: ["source.lilypond", "meta.figure-mode.lilypond", "meta.figure-expression.lilypond", "meta.figure-group.lilypond", "meta.figure-bracket.lilypond", "punctuation.definition.figure-bracket.end.lilypond"]});
        expect(tokens[31]).toEqual({value: ">", scopes: ["source.lilypond", "meta.figure-mode.lilypond", "meta.figure-expression.lilypond", "meta.figure-group.lilypond", "punctuation.definition.figure-group.end.lilypond"]});
        expect(tokens[32]).toEqual({value: " ", scopes: ["source.lilypond", "meta.figure-mode.lilypond", "meta.figure-expression.lilypond"]});
        expect(tokens[33]).toEqual({value: "}", scopes: ["source.lilypond", "meta.figure-mode.lilypond", "meta.figure-expression.lilypond"]});

        const lines = grammar.tokenizeLines(dedent`
          ${command} {
          }%{%}
        `);
        tokens = lines[0];
        expect(tokens.length).toBe(3);
        expect(tokens[0]).toEqual({value: command, scopes: ["source.lilypond", "meta.figure-mode.lilypond", "keyword.other.lilypond"]});
        expect(tokens[1]).toEqual({value: " ", scopes: ["source.lilypond", "meta.figure-mode.lilypond"]});
        expect(tokens[2]).toEqual({value: "{", scopes: ["source.lilypond", "meta.figure-mode.lilypond", "meta.figure-expression.lilypond"]});
        tokens = lines[1];
        expect(tokens.length).toBe(3);
        expect(tokens[0]).toEqual({value: "}", scopes: ["source.lilypond", "meta.figure-mode.lilypond", "meta.figure-expression.lilypond"]});
        expect(tokens[1]).toEqual({value: "%{", scopes: ["source.lilypond", "comment.block.lilypond", "punctuation.definition.comment.begin.lilypond"]});
        expect(tokens[2]).toEqual({value: "%}", scopes: ["source.lilypond", "comment.block.lilypond", "punctuation.definition.comment.end.lilypond"]});
      }
    });

    it("tokenizes \\paper blocks", () => {
      let {tokens} = grammar.tokenizeLine("\\paper %{%} { \\cm\\mm\\in\\pt }");
      expect(tokens.length).toBe(13);
      expect(tokens[0]).toEqual({value: "\\paper", scopes: ["source.lilypond", "meta.paper-block.lilypond", "keyword.other.lilypond"]});
      expect(tokens[1]).toEqual({value: " ", scopes: ["source.lilypond", "meta.paper-block.lilypond"]});
      expect(tokens[2]).toEqual({value: "%{", scopes: ["source.lilypond", "meta.paper-block.lilypond", "comment.block.lilypond", "punctuation.definition.comment.begin.lilypond"]});
      expect(tokens[3]).toEqual({value: "%}", scopes: ["source.lilypond", "meta.paper-block.lilypond", "comment.block.lilypond", "punctuation.definition.comment.end.lilypond"]});
      expect(tokens[4]).toEqual({value: " ", scopes: ["source.lilypond", "meta.paper-block.lilypond"]});
      expect(tokens[5]).toEqual({value: "{", scopes: ["source.lilypond", "meta.paper-block.lilypond", "meta.paper-expression.lilypond"]});
      expect(tokens[6]).toEqual({value: " ", scopes: ["source.lilypond", "meta.paper-block.lilypond", "meta.paper-expression.lilypond"]});
      expect(tokens[7]).toEqual({value: "\\cm", scopes: ["source.lilypond", "meta.paper-block.lilypond", "meta.paper-expression.lilypond", "support.constant.lilypond"]});
      expect(tokens[8]).toEqual({value: "\\mm", scopes: ["source.lilypond", "meta.paper-block.lilypond", "meta.paper-expression.lilypond", "support.constant.lilypond"]});
      expect(tokens[9]).toEqual({value: "\\in", scopes: ["source.lilypond", "meta.paper-block.lilypond", "meta.paper-expression.lilypond", "support.constant.lilypond"]});
      expect(tokens[10]).toEqual({value: "\\pt", scopes: ["source.lilypond", "meta.paper-block.lilypond", "meta.paper-expression.lilypond", "support.constant.lilypond"]});
      expect(tokens[11]).toEqual({value: " ", scopes: ["source.lilypond", "meta.paper-block.lilypond", "meta.paper-expression.lilypond"]});
      expect(tokens[12]).toEqual({value: "}", scopes: ["source.lilypond", "meta.paper-block.lilypond", "meta.paper-expression.lilypond"]});

      const lines = grammar.tokenizeLines(dedent`
        \\paper {
        }%{%}
      `);
      tokens = lines[0];
      expect(tokens.length).toBe(3);
      expect(tokens[0]).toEqual({value: "\\paper", scopes: ["source.lilypond", "meta.paper-block.lilypond", "keyword.other.lilypond"]});
      expect(tokens[1]).toEqual({value: " ", scopes: ["source.lilypond", "meta.paper-block.lilypond"]});
      expect(tokens[2]).toEqual({value: "{", scopes: ["source.lilypond", "meta.paper-block.lilypond", "meta.paper-expression.lilypond"]});
      tokens = lines[1];
      expect(tokens.length).toBe(3);
      expect(tokens[0]).toEqual({value: "}", scopes: ["source.lilypond", "meta.paper-block.lilypond", "meta.paper-expression.lilypond"]});
      expect(tokens[1]).toEqual({value: "%{", scopes: ["source.lilypond", "comment.block.lilypond", "punctuation.definition.comment.begin.lilypond"]});
      expect(tokens[2]).toEqual({value: "%}", scopes: ["source.lilypond", "comment.block.lilypond", "punctuation.definition.comment.end.lilypond"]});
    });

    it("tokenizes keywords", () => {
      // To create the strings in the keywords array, run:
      /*
lilypond --loglevel=ERROR - <<EOS
#(begin
  (for-each
    (lambda (keyword)
      (display "        \"")(display (car keyword))(display "\",")(newline)
    )
    (ly:lexer-keywords (ly:parser-lexer))
  )
  (display "        \"include\",")(newline)
  (display "        \"maininput\",")(newline)
  (display "        \"version\"")(newline)
)
EOS
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
        "layout",
        "lyricmode",
        "lyrics",
        "lyricsto",
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
        "with",
        "include",
        "maininput",
        "version"
      ];
      for (const suffix of keywordSuffixes) {
        const keyword = `\\${suffix}`;
        const {tokens} = grammar.tokenizeLine(keyword);
        expect(tokens.length).toBe(1);
        const scopes = ["source.lilypond", "keyword.other.lilypond"];
        switch (keyword) {
          case "\\notemode":
            scopes.splice(1, 0, "meta.note-mode.lilypond");
            break;
          case "\\markup":
          case "\\markuplist":
            scopes.splice(1, 0, "meta.markup-block.lilypond");
            break;
          case "\\addlyrics":
          case "\\lyricmode":
          case "\\lyrics":
          case "\\lyricsto":
            scopes.splice(1, 0, "meta.lyric-mode.lilypond");
            break;
          case "\\drummode":
          case "\\drums":
            scopes.splice(1, 0, "meta.drum-mode.lilypond");
            break;
          case "\\chordmode":
            scopes.splice(1, 0, "meta.chord-mode.lilypond");
            break;
          case "\\figuremode":
          case "\\figures":
            scopes.splice(1, 0, "meta.figure-mode.lilypond");
            break;
          case "\\paper":
            scopes.splice(1, 0, "meta.paper-block.lilypond");
            break;
        }
        expect(tokens[0]).toEqual({value: keyword, scopes: scopes});
      }
    });

    it("tokenizes built-in commands", () => {
      // To create the strings in the commands array, run:
      /*
git clone https://github.com/lilypond/lilypond.git
cd lilypond
git checkout stable/2.20
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
'
cd ..
rm -fR lilypond
      */
      const commands = [
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
        "\\afterGrace",
        "\\afterGraceFraction",
        "\\aikenHeads",
        "\\aikenHeadsMinor",
        "\\allowPageTurn",
        "\\allowVoltaHook",
        "\\alterBroken",
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
        "\\autoLineBreaksOff",
        "\\autoLineBreaksOn",
        "\\autoPageBreaksOff",
        "\\autoPageBreaksOn",
        "\\autochange",
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
        "\\center",
        "\\chordRepeats",
        "\\chordmodifiers",
        "\\clef",
        "\\coda",
        "\\compoundMeter",
        "\\compressFullBarRests",
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
        "\\drumPitchNames",
        "\\dynamicDown",
        "\\dynamicNeutral",
        "\\dynamicUp",
        "\\easyHeadsOff",
        "\\easyHeadsOn",
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
        "\\expandFullBarRests",
        "\\f",
        "\\featherDurations",
        "\\fermata",
        "\\fermataMarkup",
        "\\ff",
        "\\fff",
        "\\ffff",
        "\\fffff",
        "\\finger",
        "\\fixed",
        "\\flageolet",
        "\\footnote",
        "\\fp",
        "\\frenchChords",
        "\\fullJazzExceptions",
        "\\funkHeads",
        "\\funkHeadsMinor",
        "\\fz",
        "\\germanChords",
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
        "\\ionian",
        "\\italianChords",
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
        "\\partCombineListener",
        "\\partcombine",
        "\\partcombineApart",
        "\\partcombineAutomatic",
        "\\partcombineChords",
        "\\partcombineDown",
        "\\partcombineForce",
        "\\partcombineSoloI",
        "\\partcombineSoloII",
        "\\partcombineUnisono",
        "\\partcombineUp",
        "\\partial",
        "\\partialJazzExceptions",
        "\\partialJazzMusic",
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
        "\\powerChordExceptions",
        "\\powerChordSymbol",
        "\\powerChords",
        "\\pp",
        "\\ppp",
        "\\pppp",
        "\\ppppp",
        "\\prall",
        "\\pralldown",
        "\\prallmordent",
        "\\prallprall",
        "\\prallup",
        "\\predefinedFretboardsOff",
        "\\predefinedFretboardsOn",
        "\\propertyOverride",
        "\\propertyRevert",
        "\\propertySet",
        "\\propertyTweak",
        "\\propertyUnset",
        "\\pushToTag",
        "\\quoteDuring",
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
        "\\segno",
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
        "\\slashedGrace",
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
        "\\spacingTweaks",
        "\\spp",
        "\\staccatissimo",
        "\\staccato",
        "\\start",
        "\\startAcciaccaturaMusic",
        "\\startAppoggiaturaMusic",
        "\\startGraceMusic",
        "\\startGraceSlur",
        "\\startGroup",
        "\\startMeasureCount",
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
        "\\stopSlashedGraceMusic",
        "\\stopStaff",
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
        "\\textLengthOff",
        "\\textLengthOn",
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
        "\\up",
        "\\upbow",
        "\\upmordent",
        "\\upprall",
        "\\varcoda",
        "\\verylongfermata",
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
        "\\walkerHeads",
        "\\walkerHeadsMinor",
        "\\whiteTriangleMarkup",
        "\\withMusicProperty",
        "\\xNote",
        "\\xNotesOff",
        "\\xNotesOn",
      ];
      for (const command of commands) {
        const {tokens} = grammar.tokenizeLine(command);
        expect(tokens.length).toBe(1);
        const scopes = ["source.lilypond", "support.function.lilypond"];
        switch (command) {
          case "\\fixed":
          case "\\relative":
            scopes.splice(1, 0, `meta.${command.substring(1)}.lilypond`);
        }
        expect(tokens[0]).toEqual({value: command, scopes: scopes});
      }
    });

    it("tokenizes built-in markup commands", () => {
      // To create the strings in the commands array, run:
      /*
git clone https://github.com/lilypond/lilypond.git
cd lilypond
git checkout stable/2.20
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
commands = list(commands)
commands.sort()
for command in commands:
    print("        \"\\\\" + command + "\",")
'
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
        "\\command-name",
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
        expect(tokens[0]).toEqual({value: "\\markup", scopes: ["source.lilypond", "meta.markup-block.lilypond", "keyword.other.lilypond"]});
        expect(tokens[1]).toEqual({value: " ", scopes: ["source.lilypond", "meta.markup-block.lilypond"]});
        expect(tokens[2]).toEqual({value: command, scopes: ["source.lilypond", "meta.markup-block.lilypond", "support.function.lilypond"]});
      }
    });

    it("tokenizes percussion note names", () => {
      // To create the strings in the percussionNoteNames array, run:
      /*
lilypond --loglevel=ERROR - <<EOS
#(begin
  (for-each
    (lambda (drumPitchName)
      (display "        \"")(display (car drumPitchName))(display "\",")(newline)
    )
    drumPitchNames
  )
)
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
        "oneup",
        "twoup",
        "threeup",
        "fourup",
        "fiveup",
        "onedown",
        "twodown",
        "threedown",
        "fourdown",
        "fivedown",
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
        "ua",
        "ub",
        "uc",
        "ud",
        "ue",
        "da",
        "db",
        "dc",
        "dd",
        "de",
      ];

      for (const command of ["\\drummode", "\\drums"]) {
        for (const percussionNoteName of percussionNoteNames) {
          const {tokens} = grammar.tokenizeLine(`${command} { ${percussionNoteName} }`);
          expect(tokens.length).toBe(7);
          expect(tokens[0]).toEqual({value: command, scopes: ["source.lilypond", "meta.drum-mode.lilypond", "keyword.other.lilypond"]});
          expect(tokens[1]).toEqual({value: " ", scopes: ["source.lilypond", "meta.drum-mode.lilypond"]});
          expect(tokens[2]).toEqual({value: "{", scopes: ["source.lilypond", "meta.drum-mode.lilypond", "meta.drum-expression.lilypond"]});
          expect(tokens[3]).toEqual({value: " ", scopes: ["source.lilypond", "meta.drum-mode.lilypond", "meta.drum-expression.lilypond"]});
          expect(tokens[4]).toEqual({value: percussionNoteName, scopes: ["source.lilypond", "meta.drum-mode.lilypond", "meta.drum-expression.lilypond", "support.variable.percussion-note.lilypond"]});
          expect(tokens[5]).toEqual({value: " ", scopes: ["source.lilypond", "meta.drum-mode.lilypond", "meta.drum-expression.lilypond"]});
          expect(tokens[6]).toEqual({value: "}", scopes: ["source.lilypond", "meta.drum-mode.lilypond", "meta.drum-expression.lilypond"]});
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
        (lambda (pitchName)
          (display "          \"")(display (car pitchName))(display "\",")(newline)
        )
        (ly:assoc-get language language-pitch-names)
      )
      (display "        ],")(newline)
    )
    '(nederlands catalan deutsch english español français italiano norsk portugues suomi svenska vlaams)
  )
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
          "dob",
          "do",
          "dod",
          "dodd",
          "rebb",
          "reb",
          "re",
          "red",
          "redd",
          "mibb",
          "mib",
          "mi",
          "mid",
          "midd",
          "fabb",
          "fab",
          "fa",
          "fad",
          "fadd",
          "solbb",
          "solb",
          "sol",
          "sold",
          "soldd",
          "labb",
          "lab",
          "la",
          "lad",
          "ladd",
          "sibb",
          "sib",
          "si",
          "sid",
          "sidd",
          "dos",
          "doss",
          "res",
          "ress",
          "mis",
          "miss",
          "fas",
          "fass",
          "sols",
          "solss",
          "las",
          "lass",
          "sis",
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
          "ceses",
          "cessess",
          "ces",
          "cess",
          "c",
          "cis",
          "ciss",
          "cisis",
          "cississ",
          "deses",
          "dessess",
          "des",
          "dess",
          "d",
          "dis",
          "diss",
          "disis",
          "dississ",
          "eeses",
          "eessess",
          "eses",
          "essess",
          "ees",
          "eess",
          "es",
          "ess",
          "e",
          "eis",
          "eiss",
          "eisis",
          "eississ",
          "feses",
          "fessess",
          "fes",
          "fess",
          "f",
          "fis",
          "fiss",
          "fisis",
          "fississ",
          "geses",
          "gessess",
          "ges",
          "gess",
          "g",
          "g",
          "gis",
          "giss",
          "gisis",
          "gississ",
          "aeses",
          "aessess",
          "ases",
          "assess",
          "aes",
          "aess",
          "as",
          "ass",
          "a",
          "ais",
          "aiss",
          "aisis",
          "aississ",
          "bes",
          "bess",
          "b",
          "b",
          "h",
          "his",
          "hiss",
          "hisis",
          "hississ",
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
          "ces",
          "c",
          "cis",
          "cisis",
          "deses",
          "des",
          "d",
          "dis",
          "disis",
          "eses",
          "es",
          "e",
          "eis",
          "eisis",
          "feses",
          "fes",
          "f",
          "fis",
          "fisis",
          "geses",
          "ges",
          "g",
          "gis",
          "gisis",
          "asas",
          "ases",
          "as",
          "a",
          "ais",
          "aisis",
          "bb",
          "bes",
          "heses",
          "b",
          "h",
          "his",
          "hisis",
        ],
        svenska: [
          "cessess",
          "cess",
          "c",
          "ciss",
          "cississ",
          "dessess",
          "dess",
          "d",
          "diss",
          "dississ",
          "essess",
          "ess",
          "e",
          "eiss",
          "eississ",
          "fessess",
          "fess",
          "f",
          "fiss",
          "fississ",
          "gessess",
          "gess",
          "g",
          "giss",
          "gississ",
          "assess",
          "ass",
          "a",
          "aiss",
          "aississ",
          "hessess",
          "b",
          "h",
          "hiss",
          "hississ",
        ],
        vlaams: [
          "dobb",
          "dob",
          "do",
          "dok",
          "dokk",
          "rebb",
          "reb",
          "re",
          "rek",
          "rekk",
          "mibb",
          "mib",
          "mi",
          "mik",
          "mikk",
          "fabb",
          "fab",
          "fa",
          "fak",
          "fakk",
          "solbb",
          "solb",
          "sol",
          "solk",
          "solkk",
          "labb",
          "lab",
          "la",
          "lak",
          "lakk",
          "sibb",
          "sib",
          "si",
          "sik",
          "sikk",
        ],
      };

      for (const language in noteNamesByLanguage) {
        for (const noteName of noteNamesByLanguage[language]) {
          const {tokens} = grammar.tokenizeLine(`{ ${noteName} }`);
          expect(tokens.length).toBe(5);
          expect(tokens[0]).toEqual({value: "{", scopes: ["source.lilypond", "meta.music-expression.lilypond"]});
          expect(tokens[1]).toEqual({value: " ", scopes: ["source.lilypond", "meta.music-expression.lilypond"]});
          expect(tokens[2]).toEqual({value: noteName, scopes: ["source.lilypond", "meta.music-expression.lilypond", "support.variable.note-name.lilypond"]});
          expect(tokens[3]).toEqual({value: " ", scopes: ["source.lilypond", "meta.music-expression.lilypond"]});
          expect(tokens[4]).toEqual({value: "}", scopes: ["source.lilypond", "meta.music-expression.lilypond"]});
        }
      }
    });
  });
});
