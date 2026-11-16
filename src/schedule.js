import {createEmptyCard, FSRS} from 'ts-fsrs'

export const defaults = {retention:90, learn:'1m 10m', relearn:'10m', max:36500, weights:''}
export const fresh = () => createEmptyCard(new Date())
export const day = 86400000

export function scheduler(settings) {
  const steps = (text) => text.trim() ? text.trim().split(/\s+/) : []
  const parameters = {
    request_retention: settings.retention / 100,
    learning_steps: steps(settings.learn),
    relearning_steps: steps(settings.relearn),
    maximum_interval: settings.max,
    enable_fuzz: false,
    enable_short_term: true
  }
  if (settings.weights.trim()) parameters.w = settings.weights.trim().split(/[,\s]+/).map(Number)
  return new FSRS(parameters)
}
