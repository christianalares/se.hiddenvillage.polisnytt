import axios from 'axios'
import Homey from 'homey'

type PoliceEvent = {
  id: number
  datetime: string
  name: string
  summary: string
  url: string
  type: string
}

class PolisnyttApiDevice extends Homey.Device {
  newEventTriggerCard: Homey.FlowCardTriggerDevice | undefined = undefined
  cachedPoliceEvents: PoliceEvent[] | undefined = undefined
  interval = 1000 * 60 * 5 // 5 minutes
  intervalId: NodeJS.Timeout | undefined = undefined

  setBadSettingsState() {
    this.setUnavailable('No locations selected in settings')
  }

  setGoodSettingsState() {
    this.setAvailable()
  }

  getPrefs() {
    const locations = this.getSettings() as Record<string, boolean>

    const selectedLocations = Object.keys(
      Object.fromEntries(Object.entries(locations).filter(([_key, value]) => value)),
    )

    return {
      locations: selectedLocations,
    }
  }

  validateSettings() {
    const { locations } = this.getPrefs()

    if (!locations || locations.length === 0) {
      return false
    }

    return true
  }

  getApiUrl() {
    const { locations } = this.getPrefs()
    const url = new URL('https://polisen.se/api/events')

    if (locations.length > 0) {
      url.searchParams.set('locationname', locations.join(';'))
    }

    return url.toString()
  }

  getPoliceEvents = async () => {
    console.log('getPoliceEvents')

    const url = this.getApiUrl()

    try {
      const { data } = await axios.get<PoliceEvent[]>(url)
      return data.map((event) => ({
        ...event,
        url: `https://polisen.se${event.url}`,
      }))
    } catch (error) {
      this.error('Error fetching police events', error)
      return undefined
    }
  }

  runAndCheck = async () => {
    console.log('runAndCheck')
    const hasValidSettings = this.validateSettings()

    if (!hasValidSettings) {
      this.setBadSettingsState()
      return
    }

    const results = await this.getPoliceEvents()

    const lastCachedEvent = this.cachedPoliceEvents?.[0]
    const lastFetchedEvent = results?.[0]

    // Trigger the flow card if there are new events
    if (lastFetchedEvent && lastFetchedEvent.id !== lastCachedEvent?.id) {
      // const triggerCard = this.homey.flow.getTriggerCard('an-event-occured')

      this.log('New event found', lastFetchedEvent)

      this.newEventTriggerCard
        ?.trigger(this, {
          datetime: lastFetchedEvent.datetime,
          name: lastFetchedEvent.name,
          summary: lastFetchedEvent.summary,
          type: lastFetchedEvent.type,
        })
        .then((r) => this.log('newEventTriggerCard.trigger', r))
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

    this.log('PolisnyttApiDevice is ready')

    this.newEventTriggerCard = this.homey.flow.getDeviceTriggerCard('an-event-occured')

    const hasValidSettings = this.validateSettings()

    if (!hasValidSettings) {
      this.setBadSettingsState()
    }

    // Kick off the first fetch and store it in cache
    // this.cachedPoliceEvents = await this.getPoliceEvents()

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
    const validLocations = Object.keys(Object.fromEntries(Object.entries(newSettings).filter(([_key, value]) => value)))

    if (validLocations.length === 0) {
      this.setBadSettingsState()
      return 'Settings saved. Note that you need at least one location selected'
    }

    this.setGoodSettingsState()

    return 'Settings updated'
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
