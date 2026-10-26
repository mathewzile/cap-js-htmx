import cds from '@sap/cds'

export default cds.service.impl(async function () {
  /** Auto-fill integer primary keys, if necessary */
  this.before (['NEW','CREATE'], ['Books','Authors'], async req => {
    if (req.data.ID) return // skip if ID is already set
    let {id} = await SELECT.one`max(ID) as id`.from(req.target)
    req.data.ID = id + 4 // not safe, but ok for demo purposes
  })

  // SSE test: creating a draft of any author moves Emily Brontë's date of birth by a day and each of her books' stock by one.
  // Pages showing them are told by events (the Manage Books app listens to the CatalogService one).
  const EMILY = '9d703c23-7cf7-4cad-9f2b-0e1e1a8c0001'
  // NEW addresses the draft entity, EDIT the active one
  const { Authors: AuthorsView } = this.entities
  this.after(['NEW', 'EDIT'], [AuthorsView, AuthorsView.drafts], async () => {
    const { Authors, Books } = cds.entities('sap.capire.bookshop')
    const catalog = await cds.connect.to('CatalogService')
    const author = await SELECT.one.from(Authors).columns('dateOfBirth').where({ ID: EMILY })
    if (!author) return
    const next = new Date(author.dateOfBirth + 'T00:00:00Z')
    next.setUTCDate(next.getUTCDate() + 1)
    await UPDATE(Authors).set({ dateOfBirth: next.toISOString().slice(0, 10) }).where({ ID: EMILY })
    const books = await SELECT.from(Books).columns('ID').where({ author_ID: EMILY })
    await UPDATE(Books).set({ stock: { '+=': 1 } }).where({ author_ID: EMILY })
    await this.emit('AuthorChanged', { ID: EMILY })
    for (const { ID } of books) {
      await this.emit('StockChanged', { ID })
      await catalog.emit('StockChanged', { ID })
    }
  })
})