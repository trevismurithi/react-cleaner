// Regex for matching url("x.png") or url('x.png') or bg-[url('x.png')]
const URL_EXTRACT_REGEX = /url\((['"]?)([^"')]+)\1\)/gi;

// Normal image file regex
const IMAGE_REGEX = /\.(png|jpe?g|svg|gif|webp)$/i;

module.exports = {
  URL_EXTRACT_REGEX,
  IMAGE_REGEX,
};