fs = require("fs")
path = require("path")

lint = require("../lib/linter-lilypond").provideLinter().lint

describe "linter-lilypond", ->
  beforeEach ->
    waitsForPromise -> atom.packages.activatePackage "linter-lilypond"

  describe "LilyPond linter", ->
    it "lints a valid file", ->
      filePath = path.join(__dirname, "test.ly")
      file = fs.openSync(filePath, "w")
      fs.writeSync(file, "{ c' e' g' e' }")
      fs.closeSync(file)
      waitsForPromise -> atom.workspace.open(filePath).then((editor) ->
        waitsForPromise -> lint(editor).then((messages) ->
          expect(messages.length).toBe 0
          fs.unlinkSync(filePath)
        )
      )

    it "deletes output MIDI file", ->
      filePath = path.join(__dirname, "test.ly")
      file = fs.openSync(filePath, "w")
      fs.writeSync(file, "\\score { { c' } \\midi { } }")
      fs.closeSync(file)
      waitsForPromise -> atom.workspace.open(filePath).then((editor) ->
        waitsForPromise -> lint(editor).then((messages) ->
          expect(messages.length).toBe 0
          expect(-> fs.unlinkSync(path.join(__dirname, "-.midi"))).toThrow("ENOENT: no such file or directory, unlink '#{path.join(__dirname, "-.midi")}'")
          fs.unlinkSync(filePath)
        )
      )

    it "lints an invalid note name", ->
      filePath = path.join(__dirname, "test.ly")
      file = fs.openSync(filePath, "w")
      fs.writeSync(file, "{ error }")
      fs.closeSync(file)
      waitsForPromise -> atom.workspace.open(filePath).then((editor) ->
        waitsForPromise -> lint(editor).then((messages) ->
          expect(messages.length).toBe 1
          expect(messages[0].severity).toBe "error"
          # The excerpt should be "not a note name: error", but this varies by
          # LilyPond version.
          expect(messages[0].location.file).toBe filePath
          expect(messages[0].location.position).toEqual [[0, 2], [0, 7]]
          fs.unlinkSync(filePath)
        )
      )

    it "lints an error in an included file", ->
      includeFilePath = path.join(__dirname, "include.ly")
      includeFile = fs.openSync(includeFilePath, "w")
      fs.writeSync(includeFile, "{ error }")
      fs.closeSync(includeFile)
      testFilePath = path.join(__dirname, "test.ly")
      testFile = fs.openSync(testFilePath, "w")
      fs.writeSync(testFile, '\\include "include.ly"')
      fs.closeSync(testFile)
      waitsForPromise -> atom.workspace.open(testFilePath).then((editor) ->
        waitsForPromise -> lint(editor).then((messages) ->
          expect(messages.length).toBe 1
          expect(messages[0].severity).toBe "error"
          # The excerpt should be "not a note name: error", but this varies by
          # LilyPond version.
          expect(messages[0].location.file).toBe includeFilePath
          expect(messages[0].location.position).toEqual [[0, 2], [0, 2]]
          fs.unlinkSync(includeFilePath)
          fs.unlinkSync(testFilePath)
        )
      )

  describe "LilyPond grammar", ->
    grammar = undefined

    beforeEach ->
      grammar = atom.grammars.grammarForScopeName "source.lilypond"

    it "is defined", ->
      expect(grammar.scopeName).toBe "source.lilypond"
