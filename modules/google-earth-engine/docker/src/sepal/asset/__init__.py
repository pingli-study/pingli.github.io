import ee

from ..image_spec import ImageSpec
from ..aoi import Geometry
from ..gee import get_info


class Asset(ImageSpec):
    def __init__(self, spec):
        super(Asset, self).__init__()
        image = ee.Image(spec['id'])
        self.image = image
        self.aoi = Geometry(image.geometry())
        self.scale = get_info(image.projection().nominalScale())
        self.bands = get_info(image.bandNames())

    def _ee_image(self):
        return self.image
