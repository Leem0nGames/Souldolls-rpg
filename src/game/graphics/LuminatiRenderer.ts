import * as THREE from 'three';
import { pixelGenerator } from './PixelArtGenerator';
import { ecs } from '../ecs/World';
import { gameStore, GameState } from '../state/useGameStore';
import { createSoulDoll } from '../data/souldolls';
import { sound } from '../audio/SoundEffects';
import { BattleVfxDirector } from './BattleVfxDirector';
import { battleVfx } from './BattleVfx';
import { buildOverworldMap, isBlocked } from './OverworldTiles';

export class LuminatiRenderer {
  private container: HTMLElement;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private clock: THREE.Clock = new THREE.Clock();
  private frameId = 0;
  private isDestroyed = false;
  private isSoftwareGl = false;

  // Scene Groups
  private worldGroup = new THREE.Group();
  private entitiesGroup = new THREE.Group();
  private battleGroup = new THREE.Group();
  private vfxGroup = new THREE.Group();

  // Battle VFX
  private vfxDirector!: BattleVfxDirector;

  // References
  private playerSprite!: THREE.Sprite;
  private playerShadow!: THREE.Mesh;
  private unsubscribePlayerSprite?: () => void;
  private unsubscribeSoulDollSprite?: () => void;
  private shrineCrystal!: THREE.Mesh;
  private tamerSprites: { sprite: THREE.Sprite; entityId: number }[] = [];

  // Battle 3D Sprites
  private battlePlayerDollSprite!: THREE.Sprite;
  private battleOpponentDollSprite!: THREE.Sprite;
  private battleArenaPlatform!: THREE.Group;

  // Overworld
  private groundMaterial!: THREE.MeshLambertMaterial;

  // Camera settings
  private targetCameraPos = new THREE.Vector3(0, 8, 11);
  private targetCameraLookAt = new THREE.Vector3(0, 0.8, 0);
  private currentCameraLookAt = new THREE.Vector3(0, 0.8, 0);

  // Input states
  public keys: Record<string, boolean> = {};

  constructor(container: HTMLElement) {
    this.container = container;
    this.init();
  }

  private init() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    // Detect software WebGL safely
    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();
    this.isSoftwareGl = isSoftwareGl;

    // 1. Renderer Setup
    this.renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = !isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.container.appendChild(this.renderer.domElement);

    // 2. Scene & Fog Setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#090d16');
    this.scene.fog = new THREE.FogExp2('#090d16', 0.035);

    // 3. Camera (Isometric 2.5D Angle with responsive mobile FOV)
    const isPortrait = width / height < 1.0;
    this.camera = new THREE.PerspectiveCamera(isPortrait ? 52 : 45, width / height, 0.1, 150);
    const initDist = isPortrait ? 1.7 : 1.15;
    this.camera.position.set(0, 10.5 * initDist, 13.5 * initDist);
    this.camera.lookAt(0, 0.8, 0);

    // 4. Lights Rig (3-point warm/cool balance)
    const hemiLight = new THREE.HemisphereLight('#93c5fd', '#1e293b', 0.85);
    this.scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight('#fef08a', 1.4);
    sunLight.position.set(10, 16, 12);
    sunLight.castShadow = !isSoftwareGl;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 40;
    const d = 16;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0005;
    this.scene.add(sunLight);

    // Assemble Hierarchy
    this.scene.add(this.worldGroup);
    this.scene.add(this.entitiesGroup);
    this.scene.add(this.battleGroup);
    // NOTE: the VFX group is parented to the battle arena (see buildBattleArena)
    // so every effect is authored in arena local space (Y = -50 offset included).

    // Build World Geometry & Entities
    this.buildTerrain();
    this.buildSanctuaryShrine();
    this.buildBattleArena();
    this.initEcsEntities();
    this.loadOverworldMap();

    // Battle visual effects (driven by this renderer's own tick)
    this.vfxDirector = new BattleVfxDirector(
      this.vfxGroup,
      this.battlePlayerDollSprite,
      this.battleOpponentDollSprite,
      this.isSoftwareGl
    );
    battleVfx.registerSink(this.vfxDirector);

    // Resize listener
    window.addEventListener('resize', this.onResize);

    // Animation Loop
    this.tick();
  }

  /**
   * Builds the overworld ground plane. The pixel art map (tiles, transitions
   * and decorations) is baked asynchronously and applied as its texture.
   */
  private buildTerrain() {
    this.groundMaterial = new THREE.MeshLambertMaterial({ color: '#166534' });
    const terrain = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), this.groundMaterial);
    terrain.rotation.x = -Math.PI / 2;
    terrain.receiveShadow = true;
    this.worldGroup.add(terrain);
  }

  /**
   * Bakes the tilemap and applies it to the ground. The world stays playable
   * while the tiles are loading.
   */
  private async loadOverworldMap(): Promise<void> {
    try {
      const map = await buildOverworldMap();
      if (this.isDestroyed) {
        map.texture.dispose();
        return;
      }
      this.groundMaterial.map = map.texture;
      this.groundMaterial.color.set('#ffffff');
      this.groundMaterial.needsUpdate = true;
    } catch (error) {
      // Keep the flat green ground if the tiles cannot be loaded.
      console.warn('[Luminati] No se pudo cargar el mapa de tiles:', error);
    }
  }

  /**
   * Builds the 3D Sanctuary Shrine (Composite 3-12 part procedural model)
   */
  private buildSanctuaryShrine() {
    const shrine = new THREE.Group();
    shrine.position.set(0, 0, -4);
    // Scaled to the tile size of the new overworld (1 tile = 1.5 world units).
    shrine.scale.setScalar(1.35);

    // 1. Stepped Stone Pedestal
    const step1 = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 2.8, 0.4, 8),
      new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.75 })
    );
    step1.position.y = 0.2;
    step1.receiveShadow = true;
    step1.castShadow = true;
    shrine.add(step1);

    const step2 = new THREE.Mesh(
      new THREE.CylinderGeometry(1.8, 2.0, 0.3, 8),
      new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.7 })
    );
    step2.position.y = 0.55;
    step2.receiveShadow = true;
    step2.castShadow = true;
    shrine.add(step2);

    // 2. Four Ancient Rune Pillars
    const pillarMat = new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.6 });
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const px = Math.cos(ang) * 1.6;
      const pz = Math.sin(ang) * 1.6;

      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.25, 2.2, 6),
        pillarMat
      );
      pillar.position.set(px, 1.6, pz);
      pillar.castShadow = true;
      shrine.add(pillar);

      // Glowing blue gemstone on top of each pillar
      const gem = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.18),
        new THREE.MeshStandardMaterial({
          color: '#38bdf8',
          emissive: '#0284c7',
          emissiveIntensity: 1.5,
          roughness: 0.2,
        })
      );
      gem.position.set(px, 2.8, pz);
      shrine.add(gem);
    }

    // 3. Central Rotating Floating Animus Crystal (Healing Soul Core)
    const crystalGeo = new THREE.OctahedronGeometry(0.7, 0);
    const crystalMat = new THREE.MeshStandardMaterial({
      color: '#a855f7',
      emissive: '#7e22ce',
      emissiveIntensity: 2.0,
      roughness: 0.1,
      metalness: 0.8,
    });
    this.shrineCrystal = new THREE.Mesh(crystalGeo, crystalMat);
    this.shrineCrystal.position.set(0, 1.8, 0);
    this.shrineCrystal.castShadow = true;
    shrine.add(this.shrineCrystal);

    // Glowing point light from shrine
    const crystalLight = new THREE.PointLight('#c084fc', 2.0, 8);
    crystalLight.position.set(0, 2.0, 0);
    shrine.add(crystalLight);

    this.worldGroup.add(shrine);
  }

  /**
   * Builds the 3D Turn-Based Battle Arena
   */
  private buildBattleArena() {
    this.battleArenaPlatform = new THREE.Group();
    this.battleArenaPlatform.position.set(0, -50, 0); // Placed safely out of overworld view

    // Raised Circular Stadium
    const stadium = new THREE.Mesh(
      new THREE.CylinderGeometry(8.5, 9.2, 0.8, 32),
      new THREE.MeshStandardMaterial({ color: '#1e1b4b', roughness: 0.5, metalness: 0.3 })
    );
    stadium.position.y = -0.4;
    stadium.receiveShadow = true;
    this.battleArenaPlatform.add(stadium);

    // Glowing Arena Runes Ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(6.5, 7.8, 32),
      new THREE.MeshStandardMaterial({
        color: '#818cf8',
        emissive: '#4338ca',
        emissiveIntensity: 1.2,
        side: THREE.DoubleSide
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    this.battleArenaPlatform.add(ring);

    // Soft outer ring for player pedestal to integrate seamlessly into stadium
    const playerBaseRing = new THREE.Mesh(
      new THREE.RingGeometry(1.7, 2.3, 24),
      new THREE.MeshStandardMaterial({
        color: '#0369a1',
        emissive: '#0284c7',
        emissiveIntensity: 0.3,
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide,
      })
    );
    playerBaseRing.rotation.x = -Math.PI / 2;
    playerBaseRing.position.set(-2.8, 0.03, 1.4);
    this.battleArenaPlatform.add(playerBaseRing);

    // Player battle pedestal with refined bevel
    const playerPedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(1.65, 1.85, 0.22, 24),
      new THREE.MeshStandardMaterial({
        color: '#0284c7',
        emissive: '#0369a1',
        emissiveIntensity: 0.35,
        roughness: 0.65,
        metalness: 0.2,
      })
    );
    playerPedestal.position.set(-2.8, 0.11, 1.4);
    playerPedestal.receiveShadow = true;
    this.battleArenaPlatform.add(playerPedestal);

    // Elliptical contact shadow under Player Doll (grounds Ignisaur)
    const playerDollShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.85, 24),
      new THREE.MeshBasicMaterial({
        color: '#000000',
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      })
    );
    playerDollShadow.rotation.x = -Math.PI / 2;
    playerDollShadow.scale.set(1.4, 0.75, 1);
    playerDollShadow.position.set(-2.8, 0.23, 1.4);
    this.battleArenaPlatform.add(playerDollShadow);

    // Soft outer ring for opponent pedestal
    const oppBaseRing = new THREE.Mesh(
      new THREE.RingGeometry(1.7, 2.3, 24),
      new THREE.MeshStandardMaterial({
        color: '#991b1b',
        emissive: '#dc2626',
        emissiveIntensity: 0.3,
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide,
      })
    );
    oppBaseRing.rotation.x = -Math.PI / 2;
    oppBaseRing.position.set(2.8, 0.03, -1.4);
    this.battleArenaPlatform.add(oppBaseRing);

    // Opponent battle pedestal
    const oppPedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(1.65, 1.85, 0.22, 24),
      new THREE.MeshStandardMaterial({
        color: '#dc2626',
        emissive: '#991b1b',
        emissiveIntensity: 0.35,
        roughness: 0.65,
        metalness: 0.2,
      })
    );
    oppPedestal.position.set(2.8, 0.11, -1.4);
    oppPedestal.receiveShadow = true;
    this.battleArenaPlatform.add(oppPedestal);

    // Elliptical contact shadow under Opponent Doll (grounds Cryopup/Wild)
    const oppDollShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.85, 24),
      new THREE.MeshBasicMaterial({
        color: '#000000',
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      })
    );
    oppDollShadow.rotation.x = -Math.PI / 2;
    oppDollShadow.scale.set(1.4, 0.75, 1);
    oppDollShadow.position.set(2.8, 0.23, -1.4);
    this.battleArenaPlatform.add(oppDollShadow);

    // Player Doll Billboard Sprite (Back view)
    const pMat = new THREE.SpriteMaterial({
      map: pixelGenerator.getSoulDollTexture('ignisaur', true),
      transparent: true,
    });
    this.battlePlayerDollSprite = new THREE.Sprite(pMat);
    this.battlePlayerDollSprite.center.set(0.5, 0.0);
    const pAspect = pixelGenerator.getSoulDollAspect('ignisaur', true);
    const baseH = 5.18;
    this.battlePlayerDollSprite.scale.set(baseH * pAspect, baseH, 1);
    this.battlePlayerDollSprite.position.set(-2.8, 1.95, 1.4);
    this.battleArenaPlatform.add(this.battlePlayerDollSprite);

    // Opponent Doll Billboard Sprite (Front view)
    const oMat = new THREE.SpriteMaterial({
      map: pixelGenerator.getSoulDollTexture('aquafox', false),
      transparent: true,
    });
    this.battleOpponentDollSprite = new THREE.Sprite(oMat);
    this.battleOpponentDollSprite.center.set(0.5, 0.0);
    const oAspect = pixelGenerator.getSoulDollAspect('aquafox', false);
    this.battleOpponentDollSprite.scale.set(baseH * oAspect, baseH, 1);
    this.battleOpponentDollSprite.position.set(2.8, 1.95, -1.4);
    this.battleArenaPlatform.add(this.battleOpponentDollSprite);

    // Spotlight in Arena
    const arenaLight = new THREE.PointLight('#a5b4fc', 2.5, 20);
    arenaLight.position.set(0, 8, 0);
    this.battleArenaPlatform.add(arenaLight);

    // Battle VFX live inside the arena group so they share its transform
    // (the arena is offset to Y = -50) and the sprites' local space.
    this.battleArenaPlatform.add(this.vfxGroup);

    this.battleGroup.add(this.battleArenaPlatform);
  }

  /**
   * Initializes ECS entities for Player, NPC Tamers, and Wild Zones
   */
  private initEcsEntities() {
    ecs.clear();

    // 1. Player Entity
    const playerEntity = ecs.createEntity();
    ecs.positions.set(playerEntity, { x: 0, y: 0.8, z: 2.5 });
    ecs.velocities.set(playerEntity, { vx: 0, vy: 0, vz: 0 });
    ecs.playerControls.set(playerEntity, {
      speed: 4.8,
      isMoving: false,
      facing: 'down',
      isSprinting: false,
      stepDistanceAccumulator: 0,
    });

    const playerTex = pixelGenerator.getPlayerTexture('down', 0);
    const playerMat = new THREE.SpriteMaterial({ map: playerTex, transparent: true });
    this.playerSprite = new THREE.Sprite(playerMat);
    this.playerSprite.scale.set(3.6, 3.6, 1);
    this.playerSprite.position.set(0, 1.8, 2.5);
    this.entitiesGroup.add(this.playerSprite);

    // Dynamic ground contact shadow disc for the player
    const shadowGeo = new THREE.CircleGeometry(0.42, 16);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: '#000000',
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    this.playerShadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.playerShadow.rotation.x = -Math.PI / 2;
    this.playerShadow.position.set(0, 0.02, 2.5);
    this.worldGroup.add(this.playerShadow);

    // Listen for spritesheet ready event to refresh texture immediately
    this.unsubscribePlayerSprite = pixelGenerator.onPlayerSpritesheetLoaded(() => {
      if (this.playerSprite) {
        this.playerSprite.material.map = pixelGenerator.getPlayerTexture('down', 0);
        this.playerSprite.material.needsUpdate = true;
      }
    });

    // Listen for SoulDoll placeholder spritesheet load to refresh combat doll textures
    this.unsubscribeSoulDollSprite = pixelGenerator.onSoulDollSpritesheetLoaded(() => {
      const state = gameStore.getState();
      const battle = state.battleState;
      const baseH = 5.18;
      if (this.battlePlayerDollSprite && this.battleOpponentDollSprite) {
        const activePlayerDoll = battle ? state.playerParty[battle.playerActiveIndex] : state.playerParty[0];
        if (activePlayerDoll) {
          this.battlePlayerDollSprite.material.map = pixelGenerator.getSoulDollTexture(
            activePlayerDoll.speciesId,
            true
          );
          this.battlePlayerDollSprite.material.needsUpdate = true;
          const pAspect = pixelGenerator.getSoulDollAspect(activePlayerDoll.speciesId, true);
          this.battlePlayerDollSprite.scale.set(baseH * pAspect, baseH, 1);
        }
        const oppSpecies = battle?.opponentDoll ? battle.opponentDoll.speciesId : 'cryopup';
        this.battleOpponentDollSprite.material.map = pixelGenerator.getSoulDollTexture(
          oppSpecies,
          false
        );
        this.battleOpponentDollSprite.material.needsUpdate = true;
        const oAspect = pixelGenerator.getSoulDollAspect(oppSpecies, false);
        this.battleOpponentDollSprite.scale.set(baseH * oAspect, baseH, 1);
      }
    });

    ecs.sprites.set(playerEntity, {
      sprite: this.playerSprite,
      baseScale: 3.6,
      facing: 'down',
      animTimer: 0,
      stepFrame: 0,
      bobOffset: 0,
      flashTimer: 0,
    });

    // 2. NPC Tamer 1: Apprentice Tyler (Near North Path)
    const tamer1 = ecs.createEntity();
    ecs.positions.set(tamer1, { x: -3.5, y: 0.8, z: -8 });
    ecs.tamers.set(tamer1, {
      name: 'Tyler',
      title: 'Aprendiz de Almas',
      tamerType: 'apprentice',
      defeated: false,
      party: [createSoulDoll('sparkit', 9), createSoulDoll('florabun', 10)],
      dialogueIntro: '¡Alto ahí, forastero! ¡Demuéstrame el vínculo que tienes con tus SoulDolls!',
      dialogueDefeated: '¡Increíble sintonía! Tus almas combaten con una armonía admirable.',
      triggerDistance: 3.2,
    });

    const tamer1Tex = pixelGenerator.getTamerTexture('apprentice');
    const tamer1Sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tamer1Tex, transparent: true }));
    tamer1Sprite.scale.set(2.8, 2.8, 1);
    tamer1Sprite.position.set(-3.5, 1.0, -8);
    this.entitiesGroup.add(tamer1Sprite);
    this.tamerSprites.push({ sprite: tamer1Sprite, entityId: tamer1 });

    // 3. NPC Tamer 2: Master Vesper (Near East Gateway)
    const tamer2 = ecs.createEntity();
    ecs.positions.set(tamer2, { x: 7.5, y: 0.8, z: -7 });
    ecs.tamers.set(tamer2, {
      name: 'Vesper',
      title: 'Maestro del Éter',
      tamerType: 'master',
      defeated: false,
      party: [createSoulDoll('umbraling', 13), createSoulDoll('cryopup', 14)],
      dialogueIntro: 'Las sombras y la escarcha responden a mi voluntad. ¿Podrá tu llama resistir?',
      dialogueDefeated: 'Fascinante... Tus SoulDolls poseen un brillo que desafía la penumbra.',
      triggerDistance: 3.2,
    });

    const tamer2Tex = pixelGenerator.getTamerTexture('master');
    const tamer2Sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tamer2Tex, transparent: true }));
    tamer2Sprite.scale.set(2.8, 2.8, 1);
    tamer2Sprite.position.set(7.5, 1.0, -7);
    this.entitiesGroup.add(tamer2Sprite);
    this.tamerSprites.push({ sprite: tamer2Sprite, entityId: tamer2 });

    // 4. Wild Zones
    const wz1 = ecs.createEntity();
    ecs.wildZones.set(wz1, {
      name: 'Claro Silvestre',
      minX: -16,
      maxX: -6,
      minZ: -3,
      maxZ: 7,
      encounterRate: 0.08,
      speciesPool: [
        { speciesId: 'florabun', minLevel: 6, maxLevel: 10, weight: 35 },
        { speciesId: 'sparkit', minLevel: 7, maxLevel: 10, weight: 30 },
        { speciesId: 'geotort', minLevel: 6, maxLevel: 9, weight: 25 },
        { speciesId: 'venomantis', minLevel: 8, maxLevel: 11, weight: 10 }
      ]
    });

    const wz2 = ecs.createEntity();
    ecs.wildZones.set(wz2, {
      name: 'Pradera del Susurro',
      minX: 6,
      maxX: 16,
      minZ: -3,
      maxZ: 7,
      encounterRate: 0.08,
      speciesPool: [
        { speciesId: 'aquafox', minLevel: 7, maxLevel: 11, weight: 35 },
        { speciesId: 'cryopup', minLevel: 7, maxLevel: 10, weight: 30 },
        { speciesId: 'aerochick', minLevel: 6, maxLevel: 10, weight: 25 },
        { speciesId: 'lumiwisp', minLevel: 8, maxLevel: 12, weight: 10 }
      ]
    });

    // 5. Shrine Interactor
    const shrineEntity = ecs.createEntity();
    ecs.positions.set(shrineEntity, { x: 0, y: 0.8, z: -4 });
    ecs.shrines.set(shrineEntity, {
      type: 'heal',
      name: 'Santuario de las Almas',
      prompt: 'Toca el cristal para restaurar la salud y energía de tus SoulDolls.'
    });
  }

  /**
   * Main game tick
   */
  private tick = () => {
    if (this.isDestroyed) return;
    this.frameId = requestAnimationFrame(this.tick);

    const delta = Math.min(this.clock.getDelta(), 0.1);
    const state = gameStore.getState();

    // Rotate healing crystal at shrine
    if (this.shrineCrystal) {
      this.shrineCrystal.rotation.y += delta * 1.2;
      this.shrineCrystal.rotation.x = Math.sin(this.clock.getElapsedTime() * 1.5) * 0.2;
      this.shrineCrystal.position.y = 1.8 + Math.sin(this.clock.getElapsedTime() * 2) * 0.12;
    }

    const time = this.clock.getElapsedTime();

    if (state.view === 'BATTLE') {
      this.updateBattleScene(delta, state);
    } else {
      // Leaving the battle: drop every running effect.
      this.vfxDirector.clear();
      this.updateOverworld(delta, state);
    }

    // Battle VFX share this tick (no extra animation loop).
    this.vfxDirector.update(delta);

    this.renderer.render(this.scene, this.camera);
  };

  /**
   * Overworld Movement & System Updates
   */
  private updateOverworld(delta: number, state: GameState) {
    // Only update movement if no modal or dialogue is open
    const canMove = state.view === 'OVERWORLD' && !state.activeDialogue;

    const playerEntity = ecs.getPlayerEntity();
    if (playerEntity && canMove) {
      const pos = ecs.positions.get(playerEntity)!;
      const ctl = ecs.playerControls.get(playerEntity)!;
      const spr = ecs.sprites.get(playerEntity)!;

      // Handle keyboard input
      let dx = 0;
      let dz = 0;

      if (this.keys['ArrowUp'] || this.keys['KeyW']) dz -= 1;
      if (this.keys['ArrowDown'] || this.keys['KeyS']) dz += 1;
      if (this.keys['ArrowLeft'] || this.keys['KeyA']) dx -= 1;
      if (this.keys['ArrowRight'] || this.keys['KeyD']) dx += 1;

      const isSprinting = this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this.keys['KeyB'];
      const currentSpeed = (isSprinting ? ctl.speed * 1.6 : ctl.speed) * delta;

      if (dx !== 0 && dz !== 0) {
        dx *= 0.7071;
        dz *= 0.7071;
      }

      const isMoving = dx !== 0 || dz !== 0;
      ctl.isMoving = isMoving;

      if (isMoving) {
        // Update facing
        if (Math.abs(dz) >= Math.abs(dx)) {
          ctl.facing = dz > 0 ? 'down' : 'up';
        } else {
          ctl.facing = dx > 0 ? 'right' : 'left';
        }

        // Apply movement with bounds clamping and tree collision (slide).
        const nextX = THREE.MathUtils.clamp(pos.x + dx * currentSpeed, -24, 24);
        const nextZ = THREE.MathUtils.clamp(pos.z + dz * currentSpeed, -24, 24);
        if (!isBlocked(nextX, nextZ)) {
          pos.x = nextX;
          pos.z = nextZ;
        } else {
          if (!isBlocked(nextX, pos.z)) pos.x = nextX;
          if (!isBlocked(pos.x, nextZ)) pos.z = nextZ;
        }

        // Update sprite position & 6-frame walk animation from spritesheet
        spr.animTimer += delta * (isSprinting ? 15 : 10);
        spr.stepFrame = Math.floor(spr.animTimer) % 6;
        spr.sprite.material.map = pixelGenerator.getPlayerTexture(ctl.facing, spr.stepFrame);

        // Ground-level positioning without excessive artificial bounce
        spr.bobOffset = 0;

        // Step accumulator for wild encounters in spirit grass
        ctl.stepDistanceAccumulator += Math.hypot(dx * currentSpeed, dz * currentSpeed);
        if (ctl.stepDistanceAccumulator > 1.2) {
          ctl.stepDistanceAccumulator = 0;
          this.checkWildGrassEncounter(pos.x, pos.z);
        }

        // Check proximity to NPC Tamers
        this.checkTamerTriggers(pos.x, pos.z);
      } else {
        spr.animTimer = 0;
        spr.stepFrame = 0;
        spr.bobOffset = 0;
        spr.sprite.material.map = pixelGenerator.getPlayerTexture(ctl.facing, 0);
      }

      this.playerSprite.position.set(pos.x, 1.8, pos.z);
      if (this.playerShadow) {
        this.playerShadow.position.set(pos.x, 0.02, pos.z);
      }
      state.playerPosition = { x: pos.x, y: pos.y, z: pos.z };

      // Smooth camera follow (third-person 2.5D isometric trailing with wider framing)
      const isPortrait = this.camera.aspect < 1.0;
      const zoomFactor = isPortrait ? 1.4 : 1.05;
      this.targetCameraPos.set(pos.x, pos.y + 11.2 * zoomFactor, pos.z + 14.2 * zoomFactor);
      this.targetCameraLookAt.set(pos.x, pos.y + 0.5, pos.z);

      this.camera.position.lerp(this.targetCameraPos, 0.08);
      this.currentCameraLookAt.lerp(this.targetCameraLookAt, 0.08);
      this.camera.lookAt(this.currentCameraLookAt);
    }
  }

  /**
   * Checks if player stepped into wild spirit grass and triggers battle
   */
  private checkWildGrassEncounter(px: number, pz: number) {
    const zones = ecs.getWildZones();
    for (const zid of zones) {
      const z = ecs.wildZones.get(zid)!;
      if (px >= z.minX && px <= z.maxX && pz >= z.minZ && pz <= z.maxZ) {
        // Roll encounter rate
        if (Math.random() < z.encounterRate) {
          // Select species from pool based on weights
          const totalWeight = z.speciesPool.reduce((sum, s) => sum + s.weight, 0);
          let roll = Math.random() * totalWeight;
          let picked = z.speciesPool[0];

          for (const item of z.speciesPool) {
            roll -= item.weight;
            if (roll <= 0) {
              picked = item;
              break;
            }
          }

          const level = Math.floor(Math.random() * (picked.maxLevel - picked.minLevel + 1)) + picked.minLevel;
          const wildDoll = createSoulDoll(picked.speciesId, level, true);
          gameStore.startBattle(wildDoll, false);
          return;
        }
      }
    }
  }

  /**
   * Checks proximity to NPC Tamers
   */
  private checkTamerTriggers(px: number, pz: number) {
    const tamers = ecs.getTamers();
    for (const tid of tamers) {
      const tamer = ecs.tamers.get(tid)!;
      const pos = ecs.positions.get(tid)!;
      const dist = Math.hypot(px - pos.x, pz - pos.z);

      if (dist < tamer.triggerDistance && !tamer.defeated) {
        // Stop player and trigger challenger dialogue
        gameStore.setDialogue(
          `${tamer.title} ${tamer.name}`,
          tamer.dialogueIntro,
          () => {
            // Initiate trainer battle
            const firstOpponent = tamer.party[0];
            gameStore.startBattle(firstOpponent, true, tamer.name);
          }
        );
        return;
      }
    }
  }

  /**
   * Updates Battle Arena Camera & Doll sprites
   */
  private updateBattleScene(delta: number, state: GameState) {
    const battle = state.battleState;
    if (!battle) return;

    // Position camera dynamically in battle arena with wide framing for both combatants
    const isPortrait = this.camera.aspect < 1.0;
    if (isPortrait) {
      this.targetCameraPos.set(0, -50 + 12.5, 14.8);
      this.targetCameraLookAt.set(0, -50 + 1.2, 0);
    } else {
      this.targetCameraPos.set(0, -50 + 9.5, 12.2);
      this.targetCameraLookAt.set(0, -50 + 1.2, 0);
    }

    this.camera.position.lerp(this.targetCameraPos, 0.1);
    this.currentCameraLookAt.lerp(this.targetCameraLookAt, 0.1);
    this.camera.lookAt(this.currentCameraLookAt);

    // Update Player & Opponent doll textures and animations
    // Notice: Sprites are children of battleArenaPlatform (at Y = -50), so their local Y is ~1.95
    const activePlayerDoll = state.playerParty[battle.playerActiveIndex];
    const baseH = 5.18;
    if (activePlayerDoll) {
      this.battlePlayerDollSprite.material.map = pixelGenerator.getSoulDollTexture(
        activePlayerDoll.speciesId,
        true
      );
      this.battlePlayerDollSprite.material.needsUpdate = true;
      const pAspect = pixelGenerator.getSoulDollAspect(activePlayerDoll.speciesId, true);
      const breath = Math.sin(this.clock.getElapsedTime() * 4) * 0.04;
      this.battlePlayerDollSprite.scale.set(baseH * pAspect * (1 - breath * 0.5), baseH * (1 + breath), 1);
      this.battlePlayerDollSprite.position.y = 1.95;
    }

    if (battle.opponentDoll) {
      this.battleOpponentDollSprite.material.map = pixelGenerator.getSoulDollTexture(
        battle.opponentDoll.speciesId,
        false
      );
      this.battleOpponentDollSprite.material.needsUpdate = true;
      const oAspect = pixelGenerator.getSoulDollAspect(battle.opponentDoll.speciesId, false);
      const oppBreath = Math.sin(this.clock.getElapsedTime() * 4 + 1) * 0.04;
      this.battleOpponentDollSprite.scale.set(baseH * oAspect * (1 - oppBreath * 0.5), baseH * (1 + oppBreath), 1);
      this.battleOpponentDollSprite.position.y = 1.95;
    }
  }

  /**
   * Interact button pressed (E / Space / Action button)
   */
  public handleInteraction() {
    const state = gameStore.getState();
    if (state.activeDialogue) {
      gameStore.clearDialogue();
      return;
    }

    const playerEntity = ecs.getPlayerEntity();
    if (!playerEntity) return;
    const pos = ecs.positions.get(playerEntity)!;

    // Check Sanctuary Shrine healing
    const shrines = ecs.getShrines();
    for (const sid of shrines) {
      const shrinePos = ecs.positions.get(sid)!;
      const shrine = ecs.shrines.get(sid)!;
      const dist = Math.hypot(pos.x - shrinePos.x, pos.z - shrinePos.z);

      if (dist < 3.0) {
        gameStore.setDialogue(
          shrine.name,
          `${shrine.prompt}\n\n¡La energía primordial del cristal fluye hacia tus SoulDolls!`,
          () => gameStore.healParty()
        );
        return;
      }
    }

    // Check NPC Tamers interaction
    const tamers = ecs.getTamers();
    for (const tid of tamers) {
      const tpos = ecs.positions.get(tid)!;
      const tamer = ecs.tamers.get(tid)!;
      const dist = Math.hypot(pos.x - tpos.x, pos.z - tpos.z);

      if (dist < 2.5) {
        const text = tamer.defeated ? tamer.dialogueDefeated : tamer.dialogueIntro;
        gameStore.setDialogue(`${tamer.title} ${tamer.name}`, text, () => {
          if (!tamer.defeated) {
            gameStore.startBattle(tamer.party[0], true, tamer.name);
          }
        });
        return;
      }
    }
  }

  private onResize = () => {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.fov = this.camera.aspect < 1.0 ? 52 : 45;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  public destroy() {
    this.isDestroyed = true;
    cancelAnimationFrame(this.frameId);
    if (this.unsubscribePlayerSprite) {
      this.unsubscribePlayerSprite();
    }
    window.removeEventListener('resize', this.onResize);
    battleVfx.unregisterSink(this.vfxDirector);
    this.vfxDirector.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
