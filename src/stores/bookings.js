import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import {
  getMyBookings, bookSlot, cancelBooking, confirmBooking, reportBooking, removeStudent, markSeenByTeacher,
  markSeenByLearner, submitReflections, approveBookingStage, rejectBookingStage, moveBooking, dismissBookingNotice,
  rebookBooking, dropBooking, errorText,
} from '../services/api'
import { learnerActionCount, studentActionCount } from '../services/attention'
import { useOffersStore } from './offers'
import { useProfileStore } from './profile'
import { useToastStore } from './toast'

export const useBookingsStore = defineStore('bookings', () => {
  // state
  const bookings = ref([]) // every booking I am part of (each has role: 'learner' or 'teacher')
  const loading = ref(false)
  const error = ref('') // the list could not be loaded
  const actionError = ref('') // the server said no to a button (e.g. "That start time is full.")
  const busyId = ref('') // id of the booking being changed, so its buttons can be switched off
  const booking = ref(false) // true while a new booking is being made

  // reset() bumps this, so the answer to a request started for the previous person is thrown away
  let generation = 0

  // getters
  const learning = computed(() => bookings.value.filter((b) => b.role === 'learner'))
  const teaching = computed(() => bookings.value.filter((b) => b.role === 'teacher'))

  // Notices I have not pressed "Got it" on yet (newest first). As a teacher: a student cancelled
  // or moved one of my classes. As a student: the teacher moved or cancelled a class I attend.
  const notices = computed(() =>
    bookings.value
      .filter((b) => b.notice)
      .sort((a, b) => (a.notice.at < b.notice.at ? 1 : -1))
  )

  // The red numbers (see services/attention.js). Classes I attend: unread messages, newly
  // approved stages and notices. Classes I host: reflections to approve, unread messages, new
  // students and notices. Together they are the number on "My Classes" in the nav bar.
  const learningAlertCount = computed(
    () =>
      learning.value.reduce(
        // a dropped or cancelled class is no longer listed, so only its notice still counts
        (total, b) => total + (b.status !== 'cancelled' || b.awaitingNewTime ? learnerActionCount(b) : 0) + (b.notice ? 1 : 0),
        0
      )
  )
  const teachingAlertCount = computed(
    () => teaching.value.reduce((total, b) => total + studentActionCount(b) + (b.notice ? 1 : 0), 0)
  )
  const attentionCount = computed(() => learningAlertCount.value + teachingAlertCount.value)

  // credits taken from me that are still waiting for the course to finish
  const heldCredits = computed(() =>
    learning.value
      .filter((b) => b.status === 'booked' || b.status === 'disputed')
      .reduce((sum, b) => sum + b.creditCost, 0)
  )

  // actions
  async function fetchBookings() {
    const started = generation
    loading.value = true
    error.value = ''
    try {
      const mine = await getMyBookings()
      if (started !== generation) return
      bookings.value = mine
    } catch (err) {
      if (started !== generation) return
      error.value = 'Could not load your sessions: ' + errorText(err)
    }
    loading.value = false
  }

  // Same as fetchBookings, but quiet: no "Loading..." and no error message. Used to keep the
  // unread dots fresh while the page stays open.
  async function refreshBookings() {
    const started = generation
    try {
      const mine = await getMyBookings()
      if (started === generation) bookings.value = mine
    } catch (err) {
      console.log('Could not refresh the sessions:', errorText(err))
    }
  }

  function replaceBooking(updated) {
    bookings.value = bookings.value.map((b) => (b.id === updated.id ? updated : b))
  }

  // Book a start time. Returns true if it worked, false if not (the reason is in actionError).
  async function book(offerId, slotId) {
    booking.value = true
    actionError.value = ''
    const offersStore = useOffersStore()
    try {
      const data = await bookSlot(offerId, slotId)
      bookings.value = [...bookings.value, data.booking]
      offersStore.replaceOffer(data.offer) // one more seat taken
      await useProfileStore().fetchProfile() // the credit is gone from my balance
      booking.value = false
      return true
    } catch (err) {
      actionError.value = errorText(err)
      if (err.response && err.response.status === 409) {
        offersStore.fetchOffers() // the seats probably changed, show the new numbers
      }
      booking.value = false
      return false
    }
  }

  // Cancel a booking: the credits always come back (the server says no when it is too late).
  // Returns true / false like book().
  async function cancel(id) {
    busyId.value = id
    actionError.value = ''
    try {
      const data = await cancelBooking(id)
      replaceBooking(data.booking)
      if (data.offer) useOffersStore().replaceOffer(data.offer) // the seat is free again
      await useProfileStore().fetchProfile()
      useToastStore().show('Booking cancelled. Your credits are back.')
      busyId.value = ''
      return true
    } catch (err) {
      actionError.value = errorText(err)
      busyId.value = ''
      return false
    }
  }

  // Move a class I attend to another start time of the same course. Returns true / false.
  async function move(id, slotId) {
    busyId.value = id
    actionError.value = ''
    try {
      const data = await moveBooking(id, slotId)
      replaceBooking(data.booking)
      if (data.offer) useOffersStore().replaceOffer(data.offer) // the seat counts changed
      useToastStore().show('Your class was moved to the new time.')
      busyId.value = ''
      return true
    } catch (err) {
      actionError.value = errorText(err)
      busyId.value = ''
      return false
    }
  }

  // The teacher cancelled my start time (I was refunded): book another start time of the same
  // course, on the same booking (the chat stays). Returns true / false like book().
  async function rebook(id, slotId) {
    busyId.value = id
    actionError.value = ''
    try {
      const data = await rebookBooking(id, slotId)
      replaceBooking(data.booking)
      if (data.offer) useOffersStore().replaceOffer(data.offer) // one more seat taken
      await useProfileStore().fetchProfile() // the credits are held again
      useToastStore().show('You are booked on the new time.')
      busyId.value = ''
      return true
    } catch (err) {
      actionError.value = errorText(err)
      busyId.value = ''
      return false
    }
  }

  // Drop a course: after the teacher cancelled my start time (no credits move, the refund already
  // happened), or once free cancellation is over (the held credits go to the teacher: data.penalty).
  async function drop(id) {
    busyId.value = id
    actionError.value = ''
    try {
      const data = await dropBooking(id)
      replaceBooking(data.booking)
      if (data.offer) useOffersStore().replaceOffer(data.offer) // the seat is free again
      useToastStore().show(
        data.penalty
          ? 'Course dropped. Your ' + data.penalty + ' credit' + (data.penalty === 1 ? '' : 's') + ' went to ' + data.booking.teacherName + '.'
          : 'Course dropped. Your credits were already refunded.'
      )
      busyId.value = ''
      return true
    } catch (err) {
      actionError.value = errorText(err)
      busyId.value = ''
      return false
    }
  }

  // Say the course is finished. When the other person has said so too, the teacher is paid.
  async function confirm(id) {
    busyId.value = id
    actionError.value = ''
    try {
      const data = await confirmBooking(id)
      replaceBooking(data.booking)
      if (data.booking.status === 'finished') {
        await useProfileStore().fetchProfile() // if I am the teacher, my credits just went up
        useToastStore().show('Course finished. Thank you both!')
      } else {
        useToastStore().show('Marked as finished. Waiting for the other person.')
      }
      busyId.value = ''
      return true
    } catch (err) {
      actionError.value = errorText(err)
      busyId.value = ''
      return false
    }
  }

  // Report a problem with a booking
  async function report(id, reason) {
    busyId.value = id
    actionError.value = ''
    try {
      const data = await reportBooking(id, reason)
      replaceBooking(data.booking)
      useToastStore().show('Report sent. An admin will look at it.')
      busyId.value = ''
      return true
    } catch (err) {
      actionError.value = errorText(err)
      busyId.value = ''
      return false
    }
  }

  // The teacher takes a student off the class. The student is refunded.
  async function remove(id, reason) {
    busyId.value = id
    actionError.value = ''
    try {
      const data = await removeStudent(id, reason)
      replaceBooking(data.booking)
      useToastStore().show('Student removed. Their credits were refunded.')
      busyId.value = ''
      return true
    } catch (err) {
      actionError.value = errorText(err)
      busyId.value = ''
      return false
    }
  }

  // the student sends the reflections of all the stages (one text per stage, in order)
  async function sendReflections(id, reflections) {
    busyId.value = id
    actionError.value = ''
    try {
      const data = await submitReflections(id, reflections)
      replaceBooking(data.booking)
      busyId.value = ''
      return true
    } catch (err) {
      actionError.value = errorText(err)
      busyId.value = ''
      return false
    }
  }

  async function approveStage(id, stageIndex) {
    busyId.value = id
    actionError.value = ''
    try {
      const data = await approveBookingStage(id, stageIndex)
      replaceBooking(data.booking)
      if (data.finished) {
        await useProfileStore().fetchProfile() // the held credits just came to me
        useToastStore().show('Every reflection is accepted: the course is finished. You earned the credits.')
      } else {
        useToastStore().show('Reflection accepted.')
      }
      busyId.value = ''
      return true
    } catch (err) {
      actionError.value = errorText(err)
      busyId.value = ''
      return false
    }
  }

  // the teacher sends one reflection back, with an optional note. Returns true / false.
  async function rejectStage(id, stageIndex, note) {
    busyId.value = id
    actionError.value = ''
    try {
      const data = await rejectBookingStage(id, stageIndex, note)
      replaceBooking(data.booking)
      useToastStore().show('Reflection sent back. The student will be asked to rewrite it.')
      busyId.value = ''
      return true
    } catch (err) {
      actionError.value = errorText(err)
      busyId.value = ''
      return false
    }
  }

  // forget everything, e.g. when someone logs out
  function reset() {
    generation++
    bookings.value = []
    loading.value = false
    error.value = ''
    actionError.value = ''
    busyId.value = ''
  }

  // "Got it" on a notice (a class was cancelled or moved)
  async function dismissNotice(id) {
    try {
      const data = await dismissBookingNotice(id)
      replaceBooking(data.booking)
    } catch (err) {
      useToastStore().show('Could not dismiss the notice: ' + errorText(err))
    }
  }

  // The teacher opened a course's Students list: the students who just joined are no longer new.
  // Quiet if it fails (the student simply stays marked new until next time).
  async function markStudentsSeen(offerId) {
    const fresh = teaching.value.filter((b) => b.offerId === offerId && b.newStudent)
    for (const b of fresh) {
      try {
        const data = await markSeenByTeacher(b.id)
        replaceBooking(data.booking)
      } catch (err) {
        console.log('Could not mark the student as seen:', errorText(err))
      }
    }
  }

  // The student opened a class's Details: its newly approved stages are no longer new.
  // Quiet if it fails (the number simply stays until next time).
  async function markApprovalsSeen(id) {
    try {
      const data = await markSeenByLearner(id)
      replaceBooking(data.booking)
    } catch (err) {
      console.log('Could not mark the approvals as seen:', errorText(err))
    }
  }

  return {
    bookings, loading, error, actionError, busyId, booking,
    learning, teaching, heldCredits, notices,
    learningAlertCount, teachingAlertCount, attentionCount,
    fetchBookings, refreshBookings, book, cancel, move, rebook, drop, confirm, report, remove, reset,
    sendReflections, approveStage, rejectStage, dismissNotice, markStudentsSeen, markApprovalsSeen,
  }
})
