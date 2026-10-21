import {
  EntityId,
  PositionComponent,
  VelocityComponent,
  BillboardSpriteComponent,
  PlayerControlComponent,
  SoulDollDataComponent,
  WildZoneComponent,
  TamerChallengerComponent,
  ShrineComponent,
  TurnCombatantComponent
} from './Components';

export class ECSWorld {
  private nextEntityId: EntityId = 1;

  // Component Storage Tables
  public positions: Map<EntityId, PositionComponent> = new Map();
  public velocities: Map<EntityId, VelocityComponent> = new Map();
  public sprites: Map<EntityId, BillboardSpriteComponent> = new Map();
  public playerControls: Map<EntityId, PlayerControlComponent> = new Map();
  public soulDolls: Map<EntityId, SoulDollDataComponent> = new Map();
  public wildZones: Map<EntityId, WildZoneComponent> = new Map();
  public tamers: Map<EntityId, TamerChallengerComponent> = new Map();
  public shrines: Map<EntityId, ShrineComponent> = new Map();
  public combatants: Map<EntityId, TurnCombatantComponent> = new Map();

  // Create an entity
  public createEntity(): EntityId {
    return this.nextEntityId++;
  }

  // Remove an entity and clean all its components
  public destroyEntity(id: EntityId) {
    if (this.sprites.has(id)) {
      const sp = this.sprites.get(id)!;
      if (sp.sprite.parent) {
        sp.sprite.parent.remove(sp.sprite);
      }
      sp.sprite.material.dispose();
    }

    this.positions.delete(id);
    this.velocities.delete(id);
    this.sprites.delete(id);
    this.playerControls.delete(id);
    this.soulDolls.delete(id);
    this.wildZones.delete(id);
    this.tamers.delete(id);
    this.shrines.delete(id);
    this.combatants.delete(id);
  }

  // Clear all entities
  public clear() {
    for (const [id] of this.positions) {
      this.destroyEntity(id);
    }
    this.nextEntityId = 1;
  }

  // Query helper for entities with specific components
  public getEntitiesWithPositions(): EntityId[] {
    return Array.from(this.positions.keys());
  }

  public getPlayerEntity(): EntityId | null {
    for (const [id] of this.playerControls) {
      return id;
    }
    return null;
  }

  public getTamers(): EntityId[] {
    return Array.from(this.tamers.keys());
  }

  public getWildZones(): EntityId[] {
    return Array.from(this.wildZones.keys());
  }

  public getShrines(): EntityId[] {
    return Array.from(this.shrines.keys());
  }
}

export const ecs = new ECSWorld();
