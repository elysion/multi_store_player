const L = require('partial.lenses')
const { using } = require('bluebird')

const { initDb, pg } = require('../../lib/db.js')
const { addArtistsOnLabelsToIgnore } = require('../../../routes/logic.js')
const firstTrack = require('./fixtures/hoogs_track.json')
const secondTrack = require('./fixtures/another_hoogs_track.json')
const bpLogic = require('../../../routes/stores/beatport/logic.js')
const tracks = [firstTrack, secondTrack]
const assert = require('assert')
const { test } = require('../../lib/test.js')
const username = 'testuser'

test({
  'when a ignored track is added': {
    setup: async () => {
      await initDb()
      await using(pg.getTransaction(), async tx => await bpLogic.test.addTracksToUser(tx, username, [firstTrack]))
    },
    'track is added to user': async () => {
      const { trackCount } = (await pg.queryRowsAsync('select count(*) as "trackCount" from user__track'))[0]
      assert.equal(trackCount, 1)
    },
    'when artists on labels are added to ignore': {
      setup: async () => {
        return await addArtistsOnLabelsToIgnore(username, { artistIds: [1], labelIds: [1] })
      },
      'user tracks are removed': async () => {
        const { trackCount } = (await pg.queryRowsAsync('select count(*) as "trackCount" from user__track'))[0]
        assert.equal(trackCount, 0)
      }
    },
    teardown: async () => {
      // await db.initDb()
    }
  }
})
