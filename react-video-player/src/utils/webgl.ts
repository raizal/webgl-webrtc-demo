/**
 * WebGL utilities for video rendering
 */

// Vertex shader for rendering the video frame
const vertexShaderSource = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;

  void main() {
    gl_Position = vec4(a_position, 0, 1);
    v_texCoord = a_texCoord;
  }
`;

// Fragment shader for video rendering with watermark
const fragmentShaderSource = `
  precision highp float;
  uniform sampler2D u_texture;
  uniform sampler2D u_watermarkTexture;
  uniform vec2 u_watermarkSize;
  uniform bool u_hasWatermark;
  varying vec2 v_texCoord;

  // Render the watermark in the top-right corner
  vec4 renderWatermark(vec2 coord) {
    if (!u_hasWatermark) return vec4(0.0);
    
    // Position in top right with some padding
    vec2 topRight = vec2(1.0 - 0.02, 0.02); // 2% padding from edges
    
    // Determine if we're in the watermark region
    if (coord.x < topRight.x - u_watermarkSize.x || 
        coord.x > topRight.x || 
        coord.y < topRight.y || 
        coord.y > topRight.y + u_watermarkSize.y) {
      return vec4(0.0);
    }
    
    // Calculate texture coordinates within the watermark
    vec2 watermarkCoord = vec2(
      (coord.x - (topRight.x - u_watermarkSize.x)) / u_watermarkSize.x,
      (coord.y - topRight.y) / u_watermarkSize.y
    );
    
    // Use the Y coordinate directly without flipping
    // watermarkCoord.y = 1.0 - watermarkCoord.y;
    
    // Sample the watermark texture
    return texture2D(u_watermarkTexture, watermarkCoord);
  }
  
  void main() {
    vec2 center = vec2(0.5, 0.5);
    vec4 color = texture2D(u_texture, v_texCoord);
    
    // Apply watermark
    vec4 watermark = renderWatermark(v_texCoord);
    if (watermark.a > 0.0) {
      // Blend the watermark with the video
      color = mix(color, watermark, watermark.a * 0.3);
    }
    
    gl_FragColor = vec4(color.rgb, color.a);
  }
`;

/**
 * Compile a shader from source code
 */
function compileShader(gl: WebGLRenderingContext, source: string, type: number): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) {
    console.error('Failed to create shader');
    return null;
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

/**
 * Create a WebGL program from vertex and fragment shaders
 */
function createProgram(
  gl: WebGLRenderingContext,
  vertexShader: WebGLShader,
  fragmentShader: WebGLShader
): WebGLProgram | null {
  const program = gl.createProgram();
  if (!program) {
    console.error('Failed to create WebGL program');
    return null;
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program linking error:', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }

  return program;
}

/**
 * Generate a font texture with ASCII characters
 */
function generateFontTexture(gl: WebGLRenderingContext): WebGLTexture | null {
  const fontTexture = gl.createTexture();
  if (!fontTexture) return null;
  
  // Create a canvas to render the font
  const canvas = document.createElement('canvas');
  canvas.width = 256; // 16 chars per row
  canvas.height = 96;  // 6 rows
  
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  
  // Clear the canvas with transparency
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Set font properties for better digit clarity
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'white';
  
  // Draw all printable ASCII characters
  const cellWidth = canvas.width / 16;
  const cellHeight = canvas.height / 6;
  
  // Draw a special focus on digits for better quality
  for (let i = 32; i < 128; i++) {
    const x = (i % 16) * cellWidth + cellWidth / 2;
    const y = Math.floor((i - 32) / 16) * cellHeight + cellHeight / 2;
    
    // Digits 0-9 (ASCII 48-57)
    if (i >= 48 && i <= 57) {
      // Use a larger, clearer font for digits
      ctx.font = 'bold 24px monospace';
      ctx.fillText(String.fromCharCode(i), x, y);
      ctx.font = 'bold 16px monospace'; // Reset for other characters
    } else {
      ctx.fillText(String.fromCharCode(i), x, y);
    }
  }
  
  // Bind the texture and upload the font atlas
  gl.bindTexture(gl.TEXTURE_2D, fontTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  
  // Set texture parameters for better quality
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  
  return fontTexture;
}

/**
 * Load an image and create a WebGL texture from it
 */
function createImageTexture(gl: WebGLRenderingContext, url: string): Promise<{
  texture: WebGLTexture | null;
  width: number;
  height: number;
  aspectRatio: number;
}> {
  return new Promise((resolve) => {
    const texture = gl.createTexture();
    if (!texture) {
      resolve({ texture: null, width: 0, height: 0, aspectRatio: 1 });
      return;
    }
    
    const image = new Image();
    image.crossOrigin = 'anonymous'; // Handle CORS if needed
    
    image.onload = () => {
      // Bind and set up the texture
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      
      // Set texture parameters
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      
      // Calculate aspect ratio while ensuring minimum dimensions
      let width = image.width;
      let height = image.height;
      const aspectRatio = width / height;
      
      // Ensure maximum dimensions of 128x128 while preserving aspect ratio
      const maxSize = 128.0; // Maximum size in pixels
      
      if (width > maxSize || height > maxSize) {
        if (aspectRatio >= 1) {
          // Wider than tall
          width = maxSize;
          height = maxSize / aspectRatio;
        } else {
          // Taller than wide
          height = maxSize;
          width = maxSize * aspectRatio;
        }
      }
      
      // Convert to normalized coordinates (0-1) based on viewport
      const normalizedWidth = width / 1280.0; // Assuming 1280x720 viewport
      const normalizedHeight = height / 720.0;
      
      resolve({ 
        texture, 
        width: normalizedWidth, 
        height: normalizedHeight,
        aspectRatio 
      });
    };
    
    image.onerror = () => {
      console.error('Failed to load watermark image:', url);
      resolve({ texture: null, width: 0, height: 0, aspectRatio: 1 });
    };
    
    image.src = url;
  });
}

// Interface for WebGL context, program, texture, and uniform locations
interface WebGLSetup {
  gl: WebGLRenderingContext | null;
  program: WebGLProgram | null;
  texture: WebGLTexture | null;
  fontTexture: WebGLTexture | null;
  watermarkTexture: WebGLTexture | null;
  fpsUniformLocation: WebGLUniformLocation | null;
  fontTextureLocation: WebGLUniformLocation | null;
  watermarkTextureLocation: WebGLUniformLocation | null;
  watermarkSizeLocation: WebGLUniformLocation | null;
  hasWatermarkLocation: WebGLUniformLocation | null;
  watermarkSize: { width: number; height: number };
  hasWatermark: boolean;
}

/**
 * Set up WebGL context, program, and texture for video rendering
 */
export async function setupWebGL(canvas: HTMLCanvasElement, watermarkUrl?: string): Promise<WebGLSetup> {
  // Get WebGL context
  const gl = canvas.getContext('webgl');
  if (!gl) {
    console.error('WebGL not supported');
    return { 
      gl: null, 
      program: null, 
      texture: null, 
      fontTexture: null,
      watermarkTexture: null,
      fpsUniformLocation: null,
      fontTextureLocation: null,
      watermarkTextureLocation: null,
      watermarkSizeLocation: null,
      hasWatermarkLocation: null,
      watermarkSize: { width: 0, height: 0 },
      hasWatermark: false
    };
  }

  // Compile shaders
  const vertexShader = compileShader(gl, vertexShaderSource, gl.VERTEX_SHADER);
  const fragmentShader = compileShader(gl, fragmentShaderSource, gl.FRAGMENT_SHADER);
  
  if (!vertexShader || !fragmentShader) {
    return { 
      gl, 
      program: null, 
      texture: null, 
      fontTexture: null,
      watermarkTexture: null,
      fpsUniformLocation: null,
      fontTextureLocation: null,
      watermarkTextureLocation: null,
      watermarkSizeLocation: null,
      hasWatermarkLocation: null,
      watermarkSize: { width: 0, height: 0 },
      hasWatermark: false
    };
  }

  // Create and link program
  const program = createProgram(gl, vertexShader, fragmentShader);
  if (!program) {
    return { 
      gl, 
      program: null, 
      texture: null, 
      fontTexture: null,
      watermarkTexture: null,
      fpsUniformLocation: null,
      fontTextureLocation: null,
      watermarkTextureLocation: null,
      watermarkSizeLocation: null,
      hasWatermarkLocation: null,
      watermarkSize: { width: 0, height: 0 },
      hasWatermark: false
    };
  }

  // Clean up shaders
  gl.detachShader(program, vertexShader);
  gl.detachShader(program, fragmentShader);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  // Use the program
  gl.useProgram(program);

  // Get uniform locations
  const fpsUniformLocation = gl.getUniformLocation(program, 'u_fps');
  const fontTextureLocation = gl.getUniformLocation(program, 'u_fontTexture');
  const watermarkTextureLocation = gl.getUniformLocation(program, 'u_watermarkTexture');
  const watermarkSizeLocation = gl.getUniformLocation(program, 'u_watermarkSize');
  const hasWatermarkLocation = gl.getUniformLocation(program, 'u_hasWatermark');

  // Set up geometry (2 triangles for a rectangle)
  const positions = [
    -1, -1,  // Bottom left
     1, -1,  // Bottom right
    -1,  1,  // Top left
     1,  1   // Top right
  ];

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

  const positionLocation = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  // Set up texture coordinates
  const texCoords = [
    0, 1,  // Bottom left
    1, 1,  // Bottom right
    0, 0,  // Top left
    1, 0   // Top right
  ];

  const texCoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texCoords), gl.STATIC_DRAW);

  const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');
  gl.enableVertexAttribArray(texCoordLocation);
  gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

  // Create video texture
  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);

  // Set texture parameters
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  
  // Set u_texture uniform to use texture unit 0
  const textureLocation = gl.getUniformLocation(program, 'u_texture');
  gl.uniform1i(textureLocation, 0);
  
  // Create and set up font texture
  const fontTexture = generateFontTexture(gl);
  if (fontTexture && fontTextureLocation) {
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, fontTexture);
    gl.uniform1i(fontTextureLocation, 1);
  }
  
  // Initialize with no watermark
  let watermarkTexture = null;
  let watermarkSize = { width: 0, height: 0 };
  let hasWatermark = false;
  
  // Load watermark if URL is provided
  if (watermarkUrl) {
    try {
      const watermarkData = await createImageTexture(gl, watermarkUrl);
      
      if (watermarkData.texture) {
        watermarkTexture = watermarkData.texture;
        watermarkSize = { 
          width: watermarkData.width, 
          height: watermarkData.height 
        };
        hasWatermark = true;
        
        // Set the watermark texture to texture unit 2
        if (watermarkTextureLocation) {
          gl.activeTexture(gl.TEXTURE2);
          gl.bindTexture(gl.TEXTURE_2D, watermarkTexture);
          gl.uniform1i(watermarkTextureLocation, 2);
        }
        
        // Set watermark size and presence uniforms
        if (watermarkSizeLocation) {
          gl.uniform2f(watermarkSizeLocation, watermarkSize.width, watermarkSize.height);
        }
        
        if (hasWatermarkLocation) {
          gl.uniform1i(hasWatermarkLocation, hasWatermark ? 1 : 0);
        }
      }
    } catch (error) {
      console.error('Error loading watermark:', error);
    }
  }
  
  // Initial clear
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  return { 
    gl, 
    program, 
    texture, 
    fontTexture,
    watermarkTexture,
    fpsUniformLocation,
    fontTextureLocation,
    watermarkTextureLocation,
    watermarkSizeLocation,
    hasWatermarkLocation,
    watermarkSize,
    hasWatermark
  };
}

/**
 * Render a video frame to the WebGL canvas
 */
export function renderVideoFrame(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  texture: WebGLTexture,
  video: HTMLVideoElement,
): void {
  // Bind the video texture to texture unit 0
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  
  // Update texture with current video frame
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
  
  // Draw the rectangle
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}