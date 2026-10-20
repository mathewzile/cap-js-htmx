import cds from '@sap/cds'

function computeStockFields(stock) {
  if (stock > 10) return { stockStatus: 'In Stock', stockCriticality: 3 }
  if (stock > 0) return { stockStatus: 'Low Stock', stockCriticality: 2 }
  return { stockStatus: 'Out of Stock', stockCriticality: 1 }
}

export default cds.service.impl(async function () {
  const { Books, Chapters } = this.entities

  this.before(['CREATE', 'UPDATE'], 'Books', req => {
    if (req.data.stock == null) return
    Object.assign(req.data, computeStockFields(req.data.stock))
  })

  this.after('READ', 'Books', results => {
    for (const row of Array.isArray(results) ? results : [results]) {
      if (row?.stock != null) Object.assign(row, computeStockFields(row.stock))
    }
  })

  this.after(['CREATE', 'UPDATE', 'DELETE'], 'Books.chapters', async (_, req) => {
    const bookID = req.data?.book_ID ?? req.params.at(-2)?.ID
    if (!bookID) return
    const chapters = await SELECT.from(Chapters).where({ book_ID: bookID })
    const totalPages = chapters.reduce((sum, c) => sum + (c.pages || 0), 0)
    await UPDATE(Books).set({ totalPages }).where({ ID: bookID })
  })

  this.on('addStock', 'Books', async req => {
    const book = await SELECT.one.from(req.subject)
    const stock = book.stock + req.data.quantity
    await UPDATE(req.subject).with({ stock, ...computeStockFields(stock) })
  })

  this.on('simulateDelivery', async req => {
    const { book, qty } = req.data
    // plain queries on the draft-enabled entity address the active data; IsActiveEntity is virtual here
    const active = await SELECT.one.from(Books).where({ ID: book })
    if (!active) return req.error(404, `Book ${book} not found`)
    const stock = active.stock + qty
    await UPDATE(Books).set({ stock, ...computeStockFields(stock) }).where({ ID: book })
    await this.emit('StockChanged', { ID: book })
  })
})
