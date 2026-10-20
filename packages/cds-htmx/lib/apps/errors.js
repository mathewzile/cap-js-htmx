/** An error whose `status` the HTTP layer answers with (unknown app 404, not allowed 403, bad
 *  reference 400, provider/bundle problems 502/503). */
class AppError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.code = status
  }
}

module.exports = { AppError }
