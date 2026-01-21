import Homey from 'homey'

class PolisnyttApiDriver extends Homey.Driver {
  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('PolisnyttApiDriver has been initialized')
  }

  /**
   * onPairListDevices is called when a user is adding a device and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  async onPairListDevices() {
    // Generate a unique ID for each new device
    const uniqueId = `polisnytt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

    return [
      {
        name: 'Polisnytt',
        data: {
          id: uniqueId,
        },
      },
    ]
  }
}

module.exports = PolisnyttApiDriver
