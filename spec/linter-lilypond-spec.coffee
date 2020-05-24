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

    it "lints an invalid note name", ->
      filePath = path.join(__dirname, "test.ly")
      file = fs.openSync(filePath, "w")
      fs.writeSync(file, "{ error }")
      fs.closeSync(file)
      waitsForPromise -> atom.workspace.open(filePath).then((editor) ->
        waitsForPromise -> lint(editor).then((messages) ->
          expect(messages.length).toBe 1
          expect(messages[0].severity).toBe "error"
          expect(messages[0].excerpt).toBe "not a note name: error"
          expect(messages[0].location.file).toBe filePath
          expect(messages[0].location.position).toEqual [[0, 2], [0, 7]]
          fs.unlinkSync(filePath)
        )
      )
