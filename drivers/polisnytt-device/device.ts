import axios from 'axios'
import Homey from 'homey'

type LatLng = {
  lat: number
  lng: number
}

// Response from the API
type PoliceEventResponse = {
  id: number
  datetime: string
  name: string
  summary: string
  url: string
  type: string
  location: {
    name: string
    gps: `${number},${number}`
  }
}

// Our internal representation of the police event
type PoliceEvent = {
  id: number
  datetime: string
  name: string
  summary: string
  url: string
  type: string
  location: {
    name: string
    gps: LatLng
  }
}

class PolisnyttApiDevice extends Homey.Device {
  newEventTriggerCard: Homey.FlowCardTriggerDevice | undefined = undefined
  cachedPoliceEvents: PoliceEvent[] | undefined = undefined
  // Every 5 seconds in debug mode, otherwise every 5 minutes
  interval = process.env.DEBUG === '1' ? 5000 : 1000 * 60 * 5
  intervalId: NodeJS.Timeout | undefined = undefined

  setBadSettingsState() {
    this.log('setBadSettingsState')

    this.setUnavailable(this.homey.__('settings.error'))
  }

  setGoodSettingsState() {
    this.log('setGoodSettingsState')

    this.setAvailable()
  }

  getPrefs() {
    this.log('getPrefs')

    const locations = this.getSettings() as Record<string, boolean>

    const selectedLocations = Object.keys(
      Object.fromEntries(Object.entries(locations).filter(([_key, value]) => value)),
    )

    return {
      locations: selectedLocations,
    }
  }

  validateSettings() {
    this.log('validateSettings')

    const { locations } = this.getPrefs()

    if (!locations || locations.length === 0) {
      return false
    }

    return true
  }

  getApiUrl() {
    this.log('getApiUrl')

    const { locations } = this.getPrefs()
    const url = new URL('https://polisen.se/api/events')

    if (locations.length > 0) {
      url.searchParams.set('locationname', locations.join(';'))
    }

    return url.toString()
  }

  getPoliceEvents = async (): Promise<PoliceEvent[] | undefined> => {
    this.log('getPoliceEvents')

    const url = this.getApiUrl()

    try {
      const { data } = await axios.get<PoliceEventResponse[]>(url)
      return data.map((event) => {
        const [lat, lng] = event.location.gps.split(',')

        return {
          ...event,
          url: `https://polisen.se${event.url}`,
          location: {
            name: event.location.name,
            gps: {
              lat: parseFloat(lat),
              lng: parseFloat(lng),
            },
          },
        }
      })
    } catch (error) {
      this.error('Error fetching police events', error)
      return undefined
    }
  }

  runAndCheck = async () => {
    this.log('runAndCheck')

    const hasValidSettings = this.validateSettings()

    if (!hasValidSettings) {
      this.setBadSettingsState()
      return
    }

    const results = await this.getPoliceEvents()

    const lastCachedEvent = this.cachedPoliceEvents?.[0]
    const lastFetchedEvent = results?.[0]

    // Trigger the flow card if there are new events and we are in debug mode
    if (process.env.DEBUG === '1' && lastFetchedEvent) {
      this.newEventTriggerCard?.trigger(this, {
        datetime: lastFetchedEvent.datetime,
        name: lastFetchedEvent.name,
        summary: lastFetchedEvent.summary,
        type: lastFetchedEvent.type,
        url: lastFetchedEvent.url,
        location: lastFetchedEvent.location.name,
        lat: lastFetchedEvent.location.gps.lat,
        lng: lastFetchedEvent.location.gps.lng,
      })
    }

    // Trigger the flow card if there are new events
    if (lastFetchedEvent && lastFetchedEvent.id !== lastCachedEvent?.id) {
      this.newEventTriggerCard
        ?.trigger(this, {
          datetime: lastFetchedEvent.datetime,
          name: lastFetchedEvent.name,
          summary: lastFetchedEvent.summary,
          type: lastFetchedEvent.type,
          url: lastFetchedEvent.url,
          location: lastFetchedEvent.location.name,
          lat: lastFetchedEvent.location.gps.lat,
          lng: lastFetchedEvent.location.gps.lng,
        })
        .catch((err) => this.error('ERROR: newEventTriggerCard.trigger', err))

      this.cachedPoliceEvents = results
    }
  }

  /*
    Built-in Homey methods below
  */

  async onInit() {
    this.log('PolisnyttApiDevice has been initialized')

    await this.driver.ready()

    this.newEventTriggerCard = this.homey.flow.getDeviceTriggerCard('an-event-occurred')

    const hasValidSettings = this.validateSettings()

    if (!hasValidSettings) {
      this.setBadSettingsState()
    }

    // Kick off the first fetch and store it in cache
    this.cachedPoliceEvents = await this.getPoliceEvents()

    // Run every 5 minutes
    this.intervalId = this.homey.setInterval(() => {
      this.runAndCheck()
    }, this.interval)
  }

  async onAdded() {
    this.log('PolisnyttApiDevice has been added')
  }

  async onSettings({
    newSettings,
  }: {
    oldSettings: { [key: string]: boolean | string | number | undefined | null }
    newSettings: { [key: string]: boolean | string | number | undefined | null }
    changedKeys: string[]
  }): Promise<string> {
    this.log('PolisnyttApiDevice settings have been updated')

    const validLocations = Object.keys(Object.fromEntries(Object.entries(newSettings).filter(([_key, value]) => value)))

    if (validLocations.length === 0) {
      this.setBadSettingsState()
      return this.homey.__('settings.savedEmpty')
    }

    this.setGoodSettingsState()

    return this.homey.__('settings.savedOk')
  }

  async onRenamed(name: string) {
    this.log(`PolisnyttApiDevice was renamed to ${name}`)
  }

  async onDeleted() {
    this.log('PolisnyttApiDevice has been deleted')
    clearInterval(this.intervalId)
    this.intervalId = undefined
  }
}

module.exports = PolisnyttApiDevice
