import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export class Car {
  constructor(scene, gameState) {
    this.scene = scene;
    this.gameState = gameState; // 여기서는 gameState라는 이름으로 받고 있음
    this.car = null;
    this.headlight1 = null;
    this.headlight2 = null;
  }

  async loadModel() {
    return new Promise((resolve) => {
      // 간단한 자동차 모델 생성
      const carGeometry = new THREE.BoxGeometry(4, 2, 8);
      const carMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
      this.car = new THREE.Mesh(carGeometry, carMaterial);
      this.car.position.set(
        this.gameState.car.position.x,
        this.gameState.car.position.y + 1.5,
        this.gameState.car.position.z
      );
      this.car.castShadow = true;
      this.scene.add(this.car);

      // 자동차 앞부분 표시
      const carFrontGeometry = new THREE.BoxGeometry(3, 1, 1);
      const carFrontMaterial = new THREE.MeshStandardMaterial({
        color: 0x00ff00,
      });
      const carFront = new THREE.Mesh(carFrontGeometry, carFrontMaterial);
      carFront.position.z = 3.5;
      this.car.add(carFront);

      // 자동차 바퀴 생성
      const wheelGeometry = new THREE.CylinderGeometry(1, 1, 0.5, 16);
      const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });

      // 앞 왼쪽 바퀴
      const frontLeftWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      frontLeftWheel.position.set(2, -1, 2);
      frontLeftWheel.rotation.z = Math.PI / 2;
      this.car.add(frontLeftWheel);

      // 앞 오른쪽 바퀴
      const frontRightWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      frontRightWheel.position.set(-2, -1, 2);
      frontRightWheel.rotation.z = Math.PI / 2;
      this.car.add(frontRightWheel);

      // 뒤 왼쪽 바퀴
      const rearLeftWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      rearLeftWheel.position.set(2, -1, -2);
      rearLeftWheel.rotation.z = Math.PI / 2;
      this.car.add(rearLeftWheel);

      // 뒤 오른쪽 바퀴
      const rearRightWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      rearRightWheel.position.set(-2, -1, -2);
      rearRightWheel.rotation.z = Math.PI / 2;
      this.car.add(rearRightWheel);

      // 헤드라이트 추가
      this.headlight1 = new THREE.SpotLight(0xffffff, 2);
      this.headlight1.position.set(1, 1, 3);
      this.headlight1.angle = Math.PI / 6;
      this.headlight1.penumbra = 0.1;
      this.headlight1.decay = 2;
      this.headlight1.distance = 30;
      this.headlight1.castShadow = true;
      this.car.add(this.headlight1);

      this.headlight2 = new THREE.SpotLight(0xffffff, 2);
      this.headlight2.position.set(-1, 1, 3);
      this.headlight2.angle = Math.PI / 6;
      this.headlight2.penumbra = 0.1;
      this.headlight2.decay = 2;
      this.headlight2.distance = 30;
      this.headlight2.castShadow = true;
      this.car.add(this.headlight2);

      resolve();

      // GLTF 모델 로드 예시 (주석 처리)
      /*
      const loader = new GLTFLoader();
      loader.load(
        'models/car.glb',
        (gltf) => {
          this.car = gltf.scene;
          this.car.position.set(
            this.gameState.car.position.x, 
            this.gameState.car.position.y, 
            this.gameState.car.position.z
          );
          this.car.scale.set(0.5, 0.5, 0.5);
          this.car.castShadow = true;
          this.scene.add(this.car);
          
          // 헤드라이트 추가
          this.headlight1 = new THREE.SpotLight(0xFFFFFF, 2);
          this.headlight1.position.set(1, 1, 3);
          this.headlight1.angle = Math.PI / 6;
          this.headlight1.penumbra = 0.1;
          this.headlight1.decay = 2;
          this.headlight1.distance = 30;
          this.headlight1.castShadow = true;
          this.car.add(this.headlight1);
          
          this.headlight2 = new THREE.SpotLight(0xFFFFFF, 2);
          this.headlight2.position.set(-1, 1, 3);
          this.headlight2.angle = Math.PI / 6;
          this.headlight2.penumbra = 0.1;
          this.headlight2.decay = 2;
          this.headlight2.distance = 30;
          this.headlight2.castShadow = true;
          this.car.add(this.headlight2);
          
          resolve();
        },
        (xhr) => {
          console.log((xhr.loaded / xhr.total * 100) + '% 로드됨');
        },
        (error) => {
          console.error('모델 로드 중 오류 발생:', error);
          // 로드 실패 시 기본 모델 생성
          this.createDefaultCar();
          resolve();
        }
      );
      */
    });
  }

  update(deltaTime) {
    // 가속/감속 처리
    const accelerationFactor = 20;
    const brakingFactor = 40;
    const dragFactor = 5;

    if (!this.gameState.controls) {
      console.warn(
        "Controls object is missing. Initializing default controls."
      );
      this.gameState.controls = {
        forward: false,
        backward: false,
        left: false,
        right: false,
        brake: false,
        horn: false,
        camera: false,
      };
    }

    if (this.gameState.controls.forward) {
      this.gameState.car.acceleration = accelerationFactor;
    } else if (this.gameState.controls.backward) {
      this.gameState.car.acceleration = -accelerationFactor;
    } else {
      this.gameState.car.acceleration = 0;
    }

    if (this.gameState.controls.brake) {
      if (this.gameState.car.speed > 0) {
        this.gameState.car.acceleration -= brakingFactor;
      } else if (this.gameState.car.speed < 0) {
        this.gameState.car.acceleration += brakingFactor;
      }
    }

    // 항력 적용
    if (this.gameState.car.speed > 0) {
      this.gameState.car.acceleration -=
        dragFactor * (this.gameState.car.speed / this.gameState.car.maxSpeed);
    } else if (this.gameState.car.speed < 0) {
      this.gameState.car.acceleration +=
        dragFactor *
        (Math.abs(this.gameState.car.speed) / this.gameState.car.maxSpeed);
    }

    // 속도 업데이트
    this.gameState.car.speed += this.gameState.car.acceleration * deltaTime;

    // 최대 속도 제한
    if (this.gameState.car.speed > this.gameState.car.maxSpeed) {
      this.gameState.car.speed = this.gameState.car.maxSpeed;
    } else if (this.gameState.car.speed < -this.gameState.car.maxSpeed / 2) {
      this.gameState.car.speed = -this.gameState.car.maxSpeed / 2;
    }

    // 회전 처리
    const rotationSpeed = 2.0;
    const speedFactor = Math.abs(this.gameState.car.speed) / 50;

    if (this.gameState.car.speed !== 0) {
      if (this.gameState.controls.left) {
        this.gameState.car.rotation +=
          rotationSpeed *
          speedFactor *
          Math.sign(this.gameState.car.speed) *
          deltaTime;
      }

      if (this.gameState.controls.right) {
        this.gameState.car.rotation -=
          rotationSpeed *
          speedFactor *
          Math.sign(this.gameState.car.speed) *
          deltaTime;
      }
    }

    // 위치 업데이트
    const movementX =
      Math.sin(this.gameState.car.rotation) *
      this.gameState.car.speed *
      deltaTime;
    const movementZ =
      Math.cos(this.gameState.car.rotation) *
      this.gameState.car.speed *
      deltaTime;

    this.gameState.car.position.x += movementX;
    this.gameState.car.position.z += movementZ;

    // 자동차 메시 업데이트
    if (this.car) {
      this.car.position.x = this.gameState.car.position.x;
      this.car.position.z = this.gameState.car.position.z;
      this.car.rotation.y = this.gameState.car.rotation;
    }

    // 속도계 업데이트
    document.getElementById("speedometer").textContent = `속도: ${Math.abs(
      Math.round(this.gameState.car.speed)
    )} km/h`;

    // 헤드라이트 업데이트
    this.updateHeadlights();

    // 카메라 업데이트
    this.updateCamera();

    // 충돌 감지
    this.checkCollisions();
  }

  // 헤드라이트 업데이트
  updateHeadlights() {
    // 헤드라이트 업데이트 코드
  }

  // 카메라 업데이트
  updateCamera() {
    // 카메라 업데이트 코드
  }

  // 충돌 감지
  checkCollisions() {
    // 충돌 감지 코드
  }
}
