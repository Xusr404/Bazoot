import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { StaticQuestionProvider } from '../src/questions/StaticQuestionProvider.js'

const quiz = {
  subject: 'Workspace Quiz',
  questions: [{ question: 'Q?', answers: ['A', 'B'], solution: 0, cooldown: 1, time: 5 }],
}

describe('StaticQuestionProvider workspace scoping', () => {
  it('keeps quiz libraries isolated by workspace', async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bazoot-quizzes-'))
    t.after(() => fs.rm(directory, { recursive: true, force: true }))
    const provider = new StaticQuestionProvider({ quizzesDir: directory })

    await provider.saveQuizz('workspace-a', 'same-id', quiz)
    await provider.saveQuizz('workspace-b', 'same-id', { ...quiz, subject: 'Other Quiz' })

    assert.equal((await provider.listQuizzes('workspace-a'))[0].subject, 'Workspace Quiz')
    assert.equal((await provider.listQuizzes('workspace-b'))[0].subject, 'Other Quiz')
    await provider.deleteQuizz('workspace-a', 'same-id')
    assert.equal((await provider.listQuizzes('workspace-a')).length, 0)
    assert.equal((await provider.listQuizzes('workspace-b')).length, 1)
  })

  it('moves legacy flat quiz files into the first active workspace once', async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bazoot-quizzes-'))
    t.after(() => fs.rm(directory, { recursive: true, force: true }))
    await fs.writeFile(path.join(directory, 'legacy.json'), JSON.stringify(quiz))
    const provider = new StaticQuestionProvider({ quizzesDir: directory })

    await provider.migrateLegacyQuizzes('default-workspace')
    assert.equal((await provider.listQuizzes('default-workspace')).length, 1)
    assert.equal((await provider.listQuizzes('other-workspace')).length, 0)
    await assert.rejects(() => fs.access(path.join(directory, 'legacy.json')))
    await fs.access(path.join(directory, 'default-workspace', 'legacy.json'))
  })

  it('deletes only the requested workspace library', async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bazoot-quizzes-'))
    t.after(() => fs.rm(directory, { recursive: true, force: true }))
    const provider = new StaticQuestionProvider({ quizzesDir: directory })
    await provider.saveQuizz('workspace-a', 'quiz', quiz)
    await provider.saveQuizz('workspace-b', 'quiz', quiz)

    await provider.deleteWorkspace('workspace-a')

    assert.equal((await provider.listQuizzes('workspace-a')).length, 0)
    assert.equal((await provider.listQuizzes('workspace-b')).length, 1)
  })
})
