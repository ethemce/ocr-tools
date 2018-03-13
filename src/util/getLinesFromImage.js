'use strict';

const Image = require('image-js').Image;
var groupRoisPerLine = require('./groupRoisPerLine');
const mean = require('ml-array-mean');
const median = require('ml-array-median');

module.exports = function getLinesFromImage(image, options = {}) {
  const { roiOptions, fingerprintOptions } = options;

  var grey = image.grey({ allowGrey: true });

  // we should allow to make a level without making a level ...
  let maskOptions = {
    invert: true
  };
  if (roiOptions.algorithm) {
    maskOptions.algorithm = roiOptions.algorithm;
  } else if (roiOptions.greyThreshold) {
    let greyThreshold = roiOptions.greyThreshold;
    if (roiOptions.level) {
      // we simulate the level by changing the threshold
      greyThreshold =
        (grey.min[0] + (grey.max[0] - grey.min[0]) * greyThreshold) /
        grey.maxValue;
    }
    maskOptions.threshold = greyThreshold;
  } else {
    throw new Error('no algorithm or greyThreshold provided to apply.');
  }

  // let mask = getMask(grey, maskOptions);
  var mask = grey.mask(maskOptions);

  var manager = image.getRoiManager();
  manager.fromMask(mask);
  // TODO: change this options until it works
  var rois = manager.getRois(roiOptions);
  var averageSurface = mean(rois.map((elem) => elem.surface));
  var medianSurface = median(rois.map((elem) => elem.surface));
  var painted = manager.paint(roiOptions);

  rois = rois.filter((roi) => roi.width !== 1 || roi.height !== 1);
  rois = rois.filter(
    (roi) => roi.surface * 3 > medianSurface && roi.surface / 3 < medianSurface
  );

  console.log('number of rois', rois.length);

  rois.forEach(function (roi) {
    var small = roi.getMask().scale({
      width: fingerprintOptions.width,
      height: fingerprintOptions.height
    });
    roi.data = Array.from(small.data);

    // draw bounding boxes
    var mask = roi.getMask();
    var mbr = mask.minimalBoundingRectangle();
    roi.mbr = mbr;
    roi.mbrWidth = getDistance(mbr[0], mbr[1]);
    roi.mbrHeight = getDistance(mbr[1], mbr[2]);
    roi.mbrSurface = roi.mbrWidth * roi.mbrHeight;
    roi.fillingFactor = roi.surface / roi.mbrSurface;

    mbr = mbr.map((point) => [
      point[0] + mask.position[0],
      point[1] + mask.position[1]
    ]);
    painted.paintPolyline(mbr, { color: [255, 0, 0] });
  });

  return {
    lines: groupRoisPerLine(rois, roiOptions),
    painted,
    mask,
    averageSurface
  };
};

function getDistance(p1, p2) {
  return Math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2);
}

function getMask(image, maskOptions) {
  let mask = new Image(image.width, image.height, { kind: 'BINARY' });
  const partsY = 4;
  const partsX = 30;
  const h = Math.floor(image.height / partsY);
  const w = Math.floor(image.width / partsX);
  for (let i = 0; i < partsX; i++) {
    for (let j = 0; j < partsY; j++) {
      let x = i * w;
      let y = j * h;
      let width = w;
      let height = h;
      if (i === partsX - 1) {
        width += image.width % partsX;
      }
      if (j === partsY - 1) {
        height += image.height % partsY;
      }
      const params = {
        x,
        y,
        width,
        height
      };
      const imagePart = image.crop(params).mask(maskOptions);
      mask.insert(imagePart, { inPlace: true, offsetX: x, offsetY: y });
    }
  }
  return mask;
}
