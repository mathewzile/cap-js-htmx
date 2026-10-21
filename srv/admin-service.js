import cds from '@sap/cds'

export default cds.service.impl(async function () {
  /** Auto-fill integer primary keys, if necessary */
  this.before (['NEW','CREATE'], ['Books','Authors'], async req => {
    if (req.data.ID) return // skip if ID is already set
    let {id} = await SELECT.one`max(ID) as id`.from(req.target)
    req.data.ID = id + 4 // not safe, but ok for demo purposes
  })
})