import { describe, it, expect } from 'vitest'

function creditsText(count) {
    return count + ' credit' + (count === 1 ? '' : 's')
}

// Singular for credit with 1, plural for others
describe('creditsText', () => {
    it('returns singular credit for 1', () => {
        expect(creditsText(1)).toBe('1 credit')
    })

    it('formats 0 credits correctly', () => {
        expect(creditsText(0)).toBe('0 credits')
    })

    it('returns plural credits for values greater than 1', () => {
        expect(creditsText(5)).toBe('5 credits')
    })
})