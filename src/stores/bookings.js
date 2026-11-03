import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import {
  getMyBookings, bookSlot, cancelBooking, confirmBooking, reportBooking, removeStudent,
  submitStageReflection, approveBookingStage, errorText,
} from '../services/api'
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

  // Cancel a booking (the credit comes back, unless it was less than 24 hours before the start:
  // then it goes to the teacher).
  // Returns true / false like book().
  async function cancel(id) {
    busyId.value = id
    actionError.value = ''
    try {
      const data = await cancelBooking(id)
      replaceBooking(data.booking)
      if (data.offer) useOffersStore().replaceOffer(data.offer) // the seat is free again
      await useProfileStore().fetchProfile()
      useToastStore().show(
        data.booking.refunded === false
          ? 'Booking cancelled. It was less than 24 hours before the start, so the credits went to the teacher.'
          : 'Booking cancelled. Your credits are back.'
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

  async function submitReflection(id, stageIndex, reflection) {
    busyId.value = id
    actionError.value = ''
    try {
      const data = await submitStageReflection(id, stageIndex, reflection)
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
      useToastStore().show('Stage approved.')
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

  return {
    bookings, loading, error, actionError, busyId, booking,
    learning, teaching, heldCredits,
    fetchBookings, refreshBookings, book, cancel, confirm, report, remove, reset,
    submitReflection, approveStage,
  }
})
