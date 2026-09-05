import { parseColoredTextUtil } from '../../utils/misc/parse-colored-text'

export function formatPageTitle(title: string, brand: string | null | undefined, fallback: string) {
    const brandName = brand
        ? parseColoredTextUtil(brand)
              .map((part) => part.text)
              .join('')
        : fallback
    return `${title} | ${brandName}`
}
