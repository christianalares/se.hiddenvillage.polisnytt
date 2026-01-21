import axios from 'axios'
import type Homey from 'homey/lib/Homey'

type PoliceEventResponse = {
  id: number
  datetime: string
  name: string
  summary: string
  url: string
  type: string
  location: {
    name: string
    gps: string
  }
}

type WidgetQuery = {
  maxEvents?: string
  deviceId?: string
}

// Helper type to access internal Homey device ID
type DeviceWithInternalId = { __id: string }

module.exports = {
  async getEvents({ homey, query }: { homey: Homey; query: WidgetQuery }) {
    const maxEvents = Math.min(Math.max(parseInt(query.maxEvents || '5', 10), 1), 10)

    // Require a device to be selected
    if (!query.deviceId) {
      return { error: 'no_device_selected' }
    }

    // Get locations from the selected device's settings
    let locations: string[] = []

    try {
      const driver = homey.drivers.getDriver('polisnytt-device')
      const driverDevices = driver.getDevices()

      // Find device by Homey's internal ID (__id property)
      const device = driverDevices.find((d) => (d as unknown as DeviceWithInternalId).__id === query.deviceId)

      if (device) {
        const settings = device.getSettings() as Record<string, boolean>

        // Get all locations that are enabled (value === true)
        locations = Object.entries(settings)
          .filter(([_, enabled]) => enabled === true)
          .map(([location]) => location)
      }
    } catch (error) {
      homey.error('Widget: Error getting device settings', error)
    }

    const url = new URL('https://polisen.se/api/events')

    if (locations.length > 0) {
      url.searchParams.set('locationname', locations.join(';'))
    }

    try {
      const { data } = await axios.get<PoliceEventResponse[]>(url.toString())

      return data.slice(0, maxEvents).map((event) => ({
        id: event.id,
        datetime: event.datetime,
        name: event.name,
        summary: event.summary,
        type: event.type,
        location: event.location.name,
        url: `https://polisen.se${event.url}`,
      }))
    } catch (error) {
      homey.error('Widget: Error fetching police events', error)
      return []
    }
  },
}
