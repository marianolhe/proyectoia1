export {
  normalizeTitle,
  rankBooks,
  scoreBook,
  type BookMatch,
  type MovieReference,
} from './book-matcher.js'
export {
  googleBooksUrlFor,
  isVolumeId,
  parseBook,
  parseBookList,
  type BookSummary,
} from './book-parser.js'
export { BooksClient, type BooksClientOptions } from './books-client.js'
export {
  compareMovieWithBook,
  type Comparison,
  type ComparisonInput,
  type Confidence,
  type Verdict,
} from './compare.js'
export { createBooksServerFactory, loadBooksConfig, type BooksConfig } from './server.js'
export { createBooksTools } from './tools.js'
