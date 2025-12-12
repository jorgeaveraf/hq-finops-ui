export function getCurrentWeekInfo() {
  const now = new Date()
  return {
    year: now.getFullYear(),
    week: getISOWeek(now),
  }
}

export function getISOWeek(date: Date) {
  const tmpDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = tmpDate.getUTCDay() || 7
  tmpDate.setUTCDate(tmpDate.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(tmpDate.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil(((tmpDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return weekNum
}
