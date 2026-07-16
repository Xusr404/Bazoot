// Vote distribution → CSS height percentages for the responses bar chart.
// Identical math to the source app (calculatePercentages).
export const calculatePercentages = (responses) => {
  const keys = Object.keys(responses)
  const values = Object.values(responses)

  if (!values.length) {
    return {}
  }

  const totalSum = values.reduce((acc, value) => acc + value, 0)
  const result = {}

  keys.forEach((key) => {
    result[key] = `${((responses[key] / totalSum) * 100).toFixed()}%`
  })

  return result
}
