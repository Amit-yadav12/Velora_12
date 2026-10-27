// This image is an AI illustration for one synthetic Jaipur listing. It must
// never replace an image belonging to a real business with the same numeric ID.
export const MI_ROAD_ELECTRICIAN_ID = 236002;
export const MI_ROAD_ELECTRICIAN_IMAGE = '/biz/mi-road-electrician-illustration.jpg';
export const MI_ROAD_ELECTRICIAN_NAME = 'MI Road Electrician on Call';
export const MI_ROAD_ELECTRICIAN_ADDRESS = '3, 1st Cross, MI Road, Jaipur';
export const MI_ROAD_ELECTRICIAN_ALT = 'AI illustration of an electrician working in a Jaipur-inspired home';

type SampleImageBusiness = {
  id: number | string;
  synthetic?: boolean;
  name?: string;
  address?: string;
  description?: string;
  image_url?: string;
  cover_url?: string;
  photos?: string[];
};

export function isMiRoadElectricianSample(b: Pick<SampleImageBusiness, 'id' | 'synthetic'>): boolean {
  return b.synthetic === true && String(b.id) === String(MI_ROAD_ELECTRICIAN_ID);
}

/** Refresh this sample, including older cached client records. The client and
 * API previously generated different names for this same sample ID; preserve
 * the API's displayed name when opening its detail page. */
export function withMiRoadElectricianImage<T extends SampleImageBusiness>(b: T): T {
  if (!isMiRoadElectricianSample(b)) return b;
  const legacyName = 'MI Road Wiring Experts';
  const oldClient = b.name === legacyName;
  return {
    ...b,
    ...(oldClient ? {
      name: MI_ROAD_ELECTRICIAN_NAME,
      address: b.address === '98, High Street, MI Road, Jaipur' ? MI_ROAD_ELECTRICIAN_ADDRESS : b.address,
      description: b.description?.replace(legacyName, MI_ROAD_ELECTRICIAN_NAME),
    } : {}),
    image_url: MI_ROAD_ELECTRICIAN_IMAGE,
    cover_url: MI_ROAD_ELECTRICIAN_IMAGE,
    photos: [MI_ROAD_ELECTRICIAN_IMAGE],
  };
}
