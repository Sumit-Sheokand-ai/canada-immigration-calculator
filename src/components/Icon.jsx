import {
  arrowForwardSharp,
  barChartSharp,
  calendarSharp,
  checkmarkDoneCircleSharp,
  diamondSharp,
  downloadSharp,
  flashSharp,
  gitCompareSharp,
  gridSharp,
  layersSharp,
  notificationsOffSharp,
  notificationsSharp,
  optionsSharp,
  peopleSharp,
  personCircleSharp,
  pieChartSharp,
  radioSharp,
  saveSharp,
  shareSocialSharp,
  shieldCheckmarkSharp,
  sparklesSharp,
  statsChartSharp,
  timeSharp,
  trendingUpSharp,
} from 'ionicons/icons';

const ICON_DATA_BY_NAME = {
  'arrow-forward-sharp': arrowForwardSharp,
  'bar-chart-sharp': barChartSharp,
  'calendar-sharp': calendarSharp,
  'checkmark-done-circle-sharp': checkmarkDoneCircleSharp,
  'diamond-sharp': diamondSharp,
  'download-sharp': downloadSharp,
  'flash-sharp': flashSharp,
  'git-compare-sharp': gitCompareSharp,
  'grid-sharp': gridSharp,
  'layers-sharp': layersSharp,
  'notifications-off-sharp': notificationsOffSharp,
  'notifications-sharp': notificationsSharp,
  'options-sharp': optionsSharp,
  'people-sharp': peopleSharp,
  'person-circle-sharp': personCircleSharp,
  'pie-chart-sharp': pieChartSharp,
  'radar-sharp': radioSharp,
  'save-sharp': saveSharp,
  'share-social-sharp': shareSocialSharp,
  'shield-checkmark-sharp': shieldCheckmarkSharp,
  'sparkles-sharp': sparklesSharp,
  'stats-chart-sharp': statsChartSharp,
  'time-sharp': timeSharp,
  'trending-up-sharp': trendingUpSharp,
};

const ICON_MARKUP_CACHE = new Map();

function getIconMarkup(name) {
  if (!name) return '';
  if (ICON_MARKUP_CACHE.has(name)) return ICON_MARKUP_CACHE.get(name);
  const iconData = ICON_DATA_BY_NAME[name];
  if (typeof iconData !== 'string') {
    ICON_MARKUP_CACHE.set(name, '');
    return '';
  }
  const commaIndex = iconData.indexOf(',');
  const markup = commaIndex === -1 ? '' : decodeURIComponent(iconData.slice(commaIndex + 1));
  ICON_MARKUP_CACHE.set(name, markup);
  return markup;
}

export default function Icon({ name, className = '', label = '', ...props }) {
  const markup = getIconMarkup(name);
  if (!markup) return null;

  const a11yProps = label
    ? { role: 'img', 'aria-label': label }
    : { 'aria-hidden': 'true' };

  return (
    <span
      className={`svg-icon ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: markup }}
      {...a11yProps}
      {...props}
    />
  );
}
