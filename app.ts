import Homey from 'homey'

// Helper type for internal device ID access
type DeviceWithInternalId = { __id: string }

class PolisnyttApp extends Homey.App {
  async onInit() {
    this.log('PolisnyttApp has been initialized')

    // Register autocomplete listener for the widget's device setting
    const eventsWidget = this.homey.dashboards.getWidget('events')

    eventsWidget.registerSettingAutocompleteListener('device', async (query: string) => {
      const driver = this.homey.drivers.getDriver('polisnytt-device')
      const devices = driver.getDevices()

      return devices
        .map((device) => ({
          name: device.getName(),
          description: this.getDeviceLocationSummary(device),
          id: (device as unknown as DeviceWithInternalId).__id,
        }))
        .filter((item) => item.name.toLowerCase().includes(query.toLowerCase()))
    })
  }

  /**
   * Get a summary of enabled locations for a device
   */
  getDeviceLocationSummary(device: Homey.Device): string {
    const settings = device.getSettings() as Record<string, boolean>
    const enabledLocations = Object.entries(settings)
      .filter(([_, enabled]) => enabled === true)
      .map(([location]) => location)

    if (enabledLocations.length === 0) {
      return 'Inga platser valda'
    }
    if (enabledLocations.length <= 3) {
      return enabledLocations.join(', ')
    }
    return `${enabledLocations.slice(0, 3).join(', ')} +${enabledLocations.length - 3} till`
  }
}

module.exports = PolisnyttApp
