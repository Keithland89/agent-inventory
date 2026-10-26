import { describe, expect, it } from 'vitest'
import { regionLabel } from './format'

describe('regionLabel', () => {
  it('spells out Azure and Power Platform region codes', () => {
    expect(regionLabel('eastus2')).toBe('East US 2')
    expect(regionLabel('unitedkingdom')).toBe('United Kingdom')
    expect(regionLabel('southeastasia')).toBe('Southeast Asia')
    expect(regionLabel('northcentralus')).toBe('North Central US')
    expect(regionLabel('uksouth')).toBe('UK South')
  })
  it('leaves unknown or already readable names alone', () => {
    expect(regionLabel('West Europe')).toBe('West Europe')
    expect(regionLabel('mars1x')).toBe('mars1x')
    expect(regionLabel('')).toBe('')
  })
})