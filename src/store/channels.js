import { Channel } from '@/types'

const types = {
  pending: 'pending',
  completed: 'completed',
  setCurrent: 'setCurrent',
  resetList: 'resetList',
  updateList: 'updateList',
  channelJoin: 'channelJoin',
  channelPart: 'channelPart',
  removeFromList: 'removeFromList',
  // updateLastMessage: 'updateLastMessage',
  changeUnreadCount: 'changeUnreadCount',
}

export default function (Messaging) {
  return {
    namespaced: true,

    state: {
      current: null,
      pending: false,
      list: [],
      // lastMessages: [], // set of channelID-messageId pairs
    },

    getters: {
      pending: (state) => state.pending,
      // Finds last message id for a specific channel
      // lastMessage: (state) => (channelID) => {
      //   const ci = state.lastMessages.findIndex(lm => lm.channelID === channelID)
      //   return ci < 0 ? 0 : state.lastMessages[ci].messageId
      // },
      current: (state) => state.current,

      // Return all but deleted
      list: (state) => state.list.filter(c => c.canJoin || c.canObserve),
      listOnDemand: (state) => () => state.list.filter(c => !c.deletedAt && !c.archivedAt),

      // Return private & public channels
      byType: (state, getters) => (type) => getters.list.filter(c => c.type === type),

      // Find channel by ID
      findByID: (state, getters) => (ID) => {
        return getters.list.filter(c => c.channelID === ID)[0] || undefined
      },

      // Find direct/group channel for a specific set of members
      findByMembership: (state, getters) => (...userIDs) => {
        const userCount = userIDs.length
        const uidstr = JSON.stringify(userIDs.sort())
        const eq = (members) => JSON.stringify([...members].sort()) === uidstr

        return getters.list.find(c => c.type === 'group' && c.members.length === userCount && eq(c.members))
      },

      otherMembersOf: (state, getters) => (channelID, userID) => {
        const ch = getters.findByID(channelID)

        if (!ch) {
          return []
        }

        if (ch.members.length === 1) {
          return ch.members
        }

        return ch.members.filter(memberID => memberID !== userID)
      },
    },

    actions: {
      // Loads & transforms all channels
      async load ({ commit, getters }) {
        commit(types.pending)
        return new Promise((resolve) => {
          Messaging.channelList().then((cc) => {
            commit(types.resetList, cc.map(c => new Channel(c)))
            return getters.list
          }).finally(() => {
            commit(types.completed)
          })
        })
      },

      setMembershipFlag ({ commit, getters }, { channelID, flag }) {
        commit(types.pending)
        Messaging.channelSetFlag({ channelID, flag }).then((ch) => {
          commit(types.updateList, new Channel(ch))
        }).finally(() => {
          commit(types.completed)
        })
      },

      removeMembershipFlag ({ commit, getters }, { channelID }) {
        commit(types.pending)
        Messaging.channelRemoveFlag({ channelID }).then((ch) => {
          commit(types.updateList, new Channel(ch))
        }).finally(() => {
          commit(types.completed)
        })
      },

      // changeUnreadCount action is called whenever a new message is received
      // and we need to update unread info on channel
      changeUnreadCount ({ commit, getters }, { channelID, delta, lastMessageID = undefined }) {
        commit(types.changeUnreadCount, { channelID, delta, lastMessageID })
      },

      // clearUnread removes unread count and last message from the channel
      clearUnread ({ commit }, { channelID }) {
        commit(types.pending)
        Messaging.messageMarkAsRead({ channelID }).then(count => {
          commit(types.changeUnreadCount, { channelID, count, lastMessageID: null })
        }).finally(() => {
          commit(types.completed)
        })
      },

      // markLastReadMessage marks last read message in the channel
      //
      // Returns promise, resolves channel
      async markLastReadMessage ({ commit, getters }, { channelID, messageID }) {
        commit(types.pending)
        return new Promise((resolve) => {
          Messaging.messageMarkAsRead({ channelID, lastReadMessageID: messageID }).then(({ lastMessageID, count }) => {
            commit(types.changeUnreadCount, { channelID, count, lastMessageID })
            resolve(getters.findByID(channelID))
          }).finally(() => {
            commit(types.completed)
          })
        })
      },
    },

    mutations: {
      [types.pending] (state) {
        state.pending = true
      },
      [types.completed] (state) {
        state.pending = false
      },

      [types.setCurrent] (state, channel) {
        state.current = channel
      },

      [types.resetList] (state, channels) {
        state.list = channels
      },

      [types.updateList] (state, channel) {
        const l = state.list
        const i = l.findIndex(c => c.channelID === channel.channelID)

        if (i === -1) {
          l.unshift(channel)
        } else {
          l[i] = channel
        }

        state.list = [...l]
      },

      [types.channelJoin] (state, { channelID, userID }) {
        const ch = state.list.findIndex(c => c.channelID === channelID)

        if (ch >= 0) {
          const channel = state.list[ch]
          if (channel.members.findIndex(m => m === userID) < 0) {
            channel.members.push(userID)
            state.list.splice(ch, 1, channel)
          }
        }
      },

      [types.channelPart] (state, { channelID, userID }) {
        const ch = state.list.findIndex(c => c.channelID === channelID)

        if (ch >= 0) {
          const channel = state.list[ch]
          const i = channel.members.findIndex(m => m === userID)
          if (i > -1) {
            channel.members.splice(i, 1)
            state.list.splice(ch, 1, channel)
          }

          // Remove non-public channels, groups from the list
          if (channel.type !== 'public') {
            state.list.splice(ch, 1)
          }
        }
      },

      [types.removeFromList] (state, { ID }) {
        state.list = [...state.list.filter(ch => ID !== ch.channelID)]
      },

      [types.changeUnreadCount] (state, { channelID, count = undefined, delta = 0, lastMessageID }) {
        const i = state.list.findIndex(c => c.channelID === channelID)

        if (i === -1) {
          throw new Error(`could not find channel (channelID: ${channelID})`)
        }

        const ch = state.list[i]

        if (count !== undefined) {
          ch.unread.count = count
        } else {
          ch.unread.count += delta
        }

        if (lastMessageID !== undefined) {
          ch.unread.lastMessageID = lastMessageID
        }

        state.list.splice(i, 1, ch)
      },
    },
  }
}
