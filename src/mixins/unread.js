import { mapActions } from 'vuex'

export default {
  data () {
    return {
      unreadInternal: {
        timeoutHandle: null,
        lastMessageID: null,
      },
    }
  },
  //
  created () {
    this.$bus.$on('$core.newUnreadCount', this.handleUnreadCounterEvent)
    this.$bus.$on('$core.newMessage', this.handleUnreadOnNewMessage)
  },

  destroyed () {
    this.$bus.$off('$core.newUnreadCount', this.handleUnreadCounterEvent)
    this.$bus.$off('$core.newMessage', this.handleUnreadOnNewMessage)
  },

  methods: {
    ...mapActions({
      markChannelAsRead: 'unread/markChannelAsRead',
      markChannelMessageAsRead: 'unread/markChannelMessageAsRead',
      markThreadAsRead: 'unread/markThreadAsRead',
      markThreadMessageAsRead: 'unread/markThreadMessageAsRead',
      updateUnreadFromEvent: 'unread/fromEvent',
    }),

    // updates internal unread counters
    handleUnreadCounterEvent ({ unread }) {
      this.updateUnreadFromEvent(unread)
    },

    // handling unread counters on new message
    //
    // we do not do anything if:
    // a) handling updated/deleted message or reply-update
    // a) it's our message, backend already took care of it
    // b) we're not following the message stream
    //
    // If we're following the stream and someone posted something,
    // we mark it as read right away.
    handleUnreadOnNewMessage (message) {
      if (message.updatedAt || message.deletedAt || message.replies > 0) {
        console.debug('updated, deleted, replies')
        return
      }

      if (this.$auth.user.userID === message.userID) {
        console.debug('handleUnreadOnNewMessage() our message, exit')
        // If this is our own message, backend already marked it as read.
        return
      }

      this.deferredUnreadOnFocus(message)
    },

    // Mark specific message in the channel as unread
    onMarkAsUnread ({ message }) {
      console.debug('onMarkAsUnread()', this.unreadInternal.lastMessageID, message.messageID)
      if (this.unreadInternal.lastMessageID === message.messageID) {
        // toggle
        console.debug('marking all as read')

        if (message.replyTo) {
          this.markThreadAsRead(message)
        } else {
          this.markChannelAsRead(message)
        }

        this.unreadInternal.lastMessageID = undefined
      } else {
        console.debug('marking message as read')

        if (message.replyTo) {
          this.markThreadMessageAsRead(message)
        } else {
          this.markChannelMessageAsRead(message)
        }

        this.unreadInternal.lastMessageID = message.messageID
      }
    },

    // needs a lot of UX testing
    // for now, we'll stick to manual reset when channel is read
    deferredUnreadOnFocus (message, handler, force) {
      const resetUnread = () => {
        console.debug('deferredUnreadOnFocus() :: resetUnread()')

        if (!this.isFollowing(message)) {
          console.debug('deferredUnreadOnFocus() :: not following')
          // Not following the stream (chan, thread), nothing to do here..
          return
        }

        console.debug('deferredUnreadOnFocus() :: marking as read', message)
        if (message.replyTo) {
          this.markThreadAsRead(message)
        } else {
          this.markChannelAsRead(message)
        }

        this.unreadInternal.lastMessageID = message.messageID
      }

      // Clear existing timeout
      if (this.unreadInternal.timeoutHandle !== null) {
        console.debug('deferredUnreadOnFocus() :: clearing timeout')
        window.clearTimeout(this.unreadInternal.timeoutHandle)
      }

      //
      if (document.hasFocus()) {
        console.debug('deferredUnreadOnFocus() :: doc has focus')
        resetUnread()
      } else {
        const resetUnreadAfterTimeout = () => {
          console.debug('deferredUnreadOnFocus() :: setting timeout for resetUnread')
          this.unreadInternal.timeoutHandle = window.setTimeout(resetUnread, 2000)
        }

        const onFocus = () => {
          console.debug('deferredUnreadOnFocus() :: onFocus() executed')
          resetUnreadAfterTimeout()
          window.removeEventListener('focus', onFocus)
        }

        // Remove existing listeners
        window.removeEventListener('focus', onFocus)

        console.debug('deferredUnreadOnFocus() :: adding onFocus() listener')
        window.addEventListener('focus', onFocus)
      }
    },
  },
}
