import {createEmptyCard, FSRS} from 'ts-fsrs'

export const fresh = () => createEmptyCard(new Date())
export const scheduler = new FSRS({
  request_retention: 0.9,
  learning_steps: ['1m', '10m'],
  relearning_steps: ['10m'],
  maximum_interval: 36500,
  enable_fuzz: false,
  enable_short_term: true
})
