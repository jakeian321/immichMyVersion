import { 
  getAlbumInfo, 
  getAssetInfo, 
  createAlbum, 
  addAssetsToAlbum, 
  removeAssetFromAlbum,
  type AlbumResponseDto,
  type AssetResponseDto 
} from '@immich/sdk';
import { notificationController, NotificationType } from '$lib/components/shared-components/notification/notification';

interface TaggedAssetGroup {
  tagNames: string[];
  assetIds: string[];
}

// Custom function to remove multiple assets from album using the bulk API endpoint
async function removeAssetsFromAlbumBulk(albumId: string, assetIds: string[]): Promise<void> {
  // Get the API base URL from the Immich SDK configuration
  // This is a bit of a workaround since we need to call the raw API
  const response = await fetch(`/api/albums/${albumId}/assets`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ids: assetIds })
  });
  
  if (!response.ok) {
    throw new Error(`Failed to remove assets from album: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

export async function organizeAlbumByTags(albumId: string): Promise<void> {
  try {
    // Get the source album with assets
    const sourceAlbum = await getAlbumInfo({ id: albumId });
    
    if (!sourceAlbum.assets || sourceAlbum.assets.length === 0) {
      notificationController.show({
        message: 'No assets found in album',
        type: NotificationType.Warning,
      });
      return;
    }
    
    notificationController.show({
      message: `Processing ${sourceAlbum.assets.length} assets in album ${sourceAlbum.albumName}`,
      type: NotificationType.Info,
    });
    
    // Group assets by their tag combinations
    const tagGroups = await groupAssetsByTags(sourceAlbum.assets);
    
    if (tagGroups.length === 0) {
      notificationController.show({
        message: 'No tagged assets found in this album',
        type: NotificationType.Warning,
      });
      return;
    }
    
    let createdCount = 0;
    const assetsToRemove: string[] = []; // Collect assets to remove after processing
    
    // Create albums for each tag combination
    for (const group of tagGroups) {
      const newAlbumName = `${sourceAlbum.albumName}_${group.tagNames.sort().join('_')}`;
      
      try {
        // Create the new album
        const newAlbum = await createAlbum({
          createAlbumDto: {
            albumName: newAlbumName,
            description: `Assets from '${sourceAlbum.albumName}' with tags: ${group.tagNames.join(', ')}`
          }
        });
        
        // Add assets to the new album
        await addAssetsToAlbum({
          id: newAlbum.id,
          bulkIdsDto: { ids: group.assetIds }
        });
        
        // Collect assets to remove from source album
        assetsToRemove.push(...group.assetIds);
        createdCount++;
        
      } catch (error) {
        console.error(`Error processing tag group ${group.tagNames.join('_')}:`, error);
      }
    }
    
    // Remove assets from source album after all processing is complete
    if (assetsToRemove.length > 0) {
      console.log(`Removing ${assetsToRemove.length} assets from source album '${sourceAlbum.albumName}'`);
      
      try {
        // Use bulk removal - the API actually supports removing multiple assets at once
        await removeAssetsFromAlbumBulk(albumId, assetsToRemove);
        console.log(`Successfully removed ${assetsToRemove.length} assets from source album`);
      } catch (error) {
        console.error('Error bulk removing assets from album:', error);
        // Fallback to individual removal if bulk fails
        console.log('Falling back to individual asset removal...');
        for (const assetId of assetsToRemove) {
          try {
            await removeAssetFromAlbum({
              id: albumId,
              assetId: assetId
            });
          } catch (error) {
            console.error(`Error removing asset ${assetId} from album:`, error);
          }
        }
      }
    }
    
    notificationController.show({
      message: `Created ${createdCount} new albums and moved ${assetsToRemove.length} assets`,
      type: NotificationType.Info,
    });
    
  } catch (error) {
    console.error('Error organizing album by tags:', error);
    notificationController.show({
      message: 'Failed to organize album by tags',
      type: NotificationType.Error,
    });
  }
}

async function groupAssetsByTags(assets: AssetResponseDto[]): Promise<TaggedAssetGroup[]> {
  const tagCombinationMap = new Map<string, string[]>();
  
  for (const asset of assets) {
    try {
      // Get detailed asset info including tags
      const assetDetails = await getAssetInfo({ id: asset.id });
      
      if (assetDetails.tags && assetDetails.tags.length > 0) {
        // Create a key from sorted tag names
        const tagNames = assetDetails.tags.map(tag => tag.name).sort();
        const tagKey = tagNames.join('|');
        
        if (!tagCombinationMap.has(tagKey)) {
          tagCombinationMap.set(tagKey, []);
        }
        tagCombinationMap.get(tagKey)!.push(asset.id);
      }
    } catch (error) {
      console.error(`Error getting details for asset ${asset.id}:`, error);
    }
  }
  
  // Convert map to array of groups
  return Array.from(tagCombinationMap.entries()).map(([tagKey, assetIds]) => ({
    tagNames: tagKey.split('|'),
    assetIds
  }));
}