import assert from 'node:assert/strict'
import { test } from 'node:test'
import { f1Normalize } from '../../worker/f1.js'

// Formato documentado da Jolpica/Ergast (/ergast/f1/current/next.json). Dados simulados, nao uma resposta real.
const ergast = (extra = {}) => ({
  MRData: {
    RaceTable: {
      Races: [
        {
          round: '24',
          raceName: 'Abu Dhabi Grand Prix',
          Circuit: { circuitName: 'Yas Marina Circuit', Location: { locality: 'Abu Dhabi', country: 'UAE' } },
          date: '2026-12-06',
          time: '13:00:00Z',
          FirstPractice: { date: '2026-12-04', time: '09:30:00Z' },
          SecondPractice: { date: '2026-12-04', time: '13:00:00Z' },
          ThirdPractice: { date: '2026-12-05', time: '10:30:00Z' },
          Qualifying: { date: '2026-12-05', time: '14:00:00Z' },
          ...extra,
        },
      ],
    },
  },
})

test('normaliza a etapa e ordena as sessoes por horario UTC', () => {
  const { race } = f1Normalize(ergast())
  assert.equal(race.name, 'Abu Dhabi Grand Prix')
  assert.equal(race.round, 24)
  assert.equal(race.place, 'Abu Dhabi, UAE')
  assert.deepEqual(race.sessions.map((s) => s.name), ['Treino livre 1', 'Treino livre 2', 'Treino livre 3', 'Classificação', 'Corrida'])
  assert.equal(race.sessions[0].start, '2026-12-04T09:30:00.000Z')
  assert.equal(race.sessions.at(-1).start, '2026-12-06T13:00:00.000Z')
})

test('fim de semana de sprint troca treinos e inclui a sprint', () => {
  const { race } = f1Normalize(ergast({
    SecondPractice: undefined,
    ThirdPractice: undefined,
    SprintQualifying: { date: '2026-12-04', time: '13:30:00Z' },
    Sprint: { date: '2026-12-05', time: '09:00:00Z' },
  }))
  assert.deepEqual(race.sessions.map((s) => s.name), ['Treino livre 1', 'Classificação da sprint', 'Sprint', 'Classificação', 'Corrida'])
})

test('sem corrida (entressafra) ou formato inesperado devolve race null', () => {
  assert.deepEqual(f1Normalize({ MRData: { RaceTable: { Races: [] } } }), { race: null })
  assert.deepEqual(f1Normalize({}), { race: null })
  assert.deepEqual(f1Normalize(null), { race: null })
  assert.deepEqual(f1Normalize(ergast({ date: undefined, time: undefined, FirstPractice: undefined, SecondPractice: undefined, ThirdPractice: undefined, Qualifying: undefined })), { race: null })
})
