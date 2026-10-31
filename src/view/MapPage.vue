<script setup>
import { AdvancedMarker, GoogleMap } from 'vue3-google-map'

const center = { lat: 40.689247, lng: -74.044502 }
</script>

<template>
  <GoogleMap api-key="AIzaSyC7BtRgcbZnjqTnvslwFCRJFFPPfTLfNPA" style="width:100%; height: 300px" :center="center" :zoom="13"></GoogleMap>
</template>