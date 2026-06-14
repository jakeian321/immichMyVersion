import { albumFactory } from '@test-data/factories/album-factory';
import { assetFactory } from '@test-data/factories/asset-factory';
import { getCombinedAssetIds } from './album-utils';

describe('getCombinedAssetIds', () => {
  it('returns an empty array when given no albums', () => {
    expect(getCombinedAssetIds([])).toEqual([]);
  });

  it('returns the union of asset ids across albums', () => {
    const assetA = assetFactory.build();
    const assetB = assetFactory.build();
    const assetC = assetFactory.build();

    const albumOne = albumFactory.build({ assets: [assetA, assetB] });
    const albumTwo = albumFactory.build({ assets: [assetC] });

    expect(getCombinedAssetIds([albumOne, albumTwo])).toEqual([assetA.id, assetB.id, assetC.id]);
  });

  it('de-duplicates assets shared between albums', () => {
    const sharedAsset = assetFactory.build();
    const onlyInFirst = assetFactory.build();
    const onlyInSecond = assetFactory.build();

    const albumOne = albumFactory.build({ assets: [sharedAsset, onlyInFirst] });
    const albumTwo = albumFactory.build({ assets: [sharedAsset, onlyInSecond] });

    expect(getCombinedAssetIds([albumOne, albumTwo])).toEqual([sharedAsset.id, onlyInFirst.id, onlyInSecond.id]);
  });
});
