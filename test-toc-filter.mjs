// Test the isMainChapter logic against real PDF TOC patterns

function isMainChapter(title, tocText) {
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const titleRegex = new RegExp(escapedTitle, 'i')
  const titleMatch = tocText.match(titleRegex)

  if (!titleMatch || titleMatch.index === undefined) {
    return { result: true, reason: 'not found - assume main' }
  }

  const afterTitleStart = titleMatch.index + titleMatch[0].length
  const afterTitle = tocText.slice(afterTitleStart, afterTitleStart + 200)

  // First check for O'Reilly sub-chapter: spaces to page number, no dots
  const spaceThenPageMatch = afterTitle.match(/^[\s\n]*(\s{10,})(\d+)/)
  if (spaceThenPageMatch) {
    const beforePageNum = spaceThenPageMatch[1]
    if (!/\./.test(beforePageNum)) {
      return { result: false, reason: 'O\'Reilly sub-chapter (space padding)', afterTitle: afterTitle.substring(0, 50) }
    }
  }

  const dotLineMatch = afterTitle.match(/(?:\.[\s]*){5,}/)

  if (!dotLineMatch) {
    return { result: true, reason: 'no dots found - main chapter', afterTitle: afterTitle.substring(0, 50) }
  }

  const dotLine = dotLineMatch[0]
  const hasDoubleSpacedDots = /\.\s{2,}\./.test(dotLine)
  const hasSingleSpacedDots = /\.\s\./.test(dotLine) || /\.{2,}/.test(dotLine)

  if (hasDoubleSpacedDots && !hasSingleSpacedDots) {
    return { result: false, reason: 'Swizec sub-chapter (double-spaced dots)', dotLine: dotLine.substring(0, 30) }
  }

  return { result: true, reason: 'main chapter (single-spaced dots)', dotLine: dotLine.substring(0, 30) }
}

// Actual raw text from book_senior_mindset.pdf (multi-line format)
const swizecToc = `TABLE OF CONTENTS

Why senior engineers get nothing done
. . . . . . . . . . . . . . . . .
1

When you're new life is great
.  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .
1

When you're seasoned though
.  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .
2

How this happens to you
.  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .
4

What makes you a senior software engineer anyway?
. . . . . . . . . .
10

So how do you become a senior engineer?
.  .  .  .  .  .  .  .  .  .  .  .  .  .
14

Computer science is not software engineering
. . . . . . . . . . . . .
18

Why study computer science then?
.  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .
20
`

console.log('=== Swizec Style Tests (Multi-line format) ===\n')

const swizecTests = [
  { title: 'Why senior engineers get nothing done', expected: true },
  { title: "When you're new life is great", expected: false },
  { title: "When you're seasoned though", expected: false },
  { title: 'How this happens to you', expected: false },
  { title: 'What makes you a senior software engineer anyway?', expected: true },
  { title: 'So how do you become a senior engineer?', expected: false },
  { title: 'Computer science is not software engineering', expected: true },
  { title: 'Why study computer science then?', expected: false },
]

let allPassed = true
for (const test of swizecTests) {
  const { result, reason, dotLine, afterTitle } = isMainChapter(test.title, swizecToc)
  const pass = result === test.expected
  if (!pass) allPassed = false
  console.log(`${pass ? '✓' : '✗'} "${test.title.substring(0, 45)}..." => ${result} (${reason})`)
  if (!pass) {
    console.log(`   Expected: ${test.expected}`)
    if (dotLine) console.log(`   dotLine: "${dotLine}"`)
    if (afterTitle) console.log(`   afterTitle: "${afterTitle}"`)
  }
}

// O'Reilly style TOC
const oreillyToc = `Table of Contents

Preface. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .    xi

1.
Introduction to Building AI Applications with Foundation Models. . . . . . . . . . . . . . . . . .    1

The Rise of AI Engineering                                                                                               2

From Language Models to Large Language Models                                                  2

Foundation Model Use Cases                                                                                         16

Coding                                                                                                                            20

2.
Understanding Foundation Models. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .    49

Training Data                                                                                                                    50
`

console.log('\n=== O\'Reilly Style Tests ===\n')

const oreillyTests = [
  { title: 'Introduction to Building AI Applications with Foundation Models', expected: true },
  { title: 'The Rise of AI Engineering', expected: false },
  { title: 'From Language Models to Large Language Models', expected: false },
  { title: 'Foundation Model Use Cases', expected: false },
  { title: 'Coding', expected: false },
  { title: 'Understanding Foundation Models', expected: true },
  { title: 'Training Data', expected: false },
]

for (const test of oreillyTests) {
  const { result, reason, dotLine, afterTitle } = isMainChapter(test.title, oreillyToc)
  const pass = result === test.expected
  if (!pass) allPassed = false
  console.log(`${pass ? '✓' : '✗'} "${test.title.substring(0, 45)}..." => ${result} (${reason})`)
  if (!pass) {
    console.log(`   Expected: ${test.expected}`)
    if (dotLine) console.log(`   dotLine: "${dotLine}"`)
    if (afterTitle) console.log(`   afterTitle: "${afterTitle}"`)
  }
}

console.log('\n' + (allPassed ? '✓ ALL TESTS PASSED' : '✗ SOME TESTS FAILED'))
